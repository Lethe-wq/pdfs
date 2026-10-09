import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfClient, type WorkerPort } from './pdf-client';
import type { Request, Response } from './pdf-protocol';
import { TaskCancelledError, WorkerFailure } from './task-errors';

class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null;
  onerror: WorkerPort['onerror'] = null;
  onmessageerror: WorkerPort['onmessageerror'] = null;
  terminated = false;
  requests: Request[] = [];
  sources = new Map<string, ArrayBuffer>();
  constructor(private intercept: (request: Request, worker: FakeWorker) => boolean = () => false) {}
  postMessage(request: Request) {
    this.requests.push(request);
    queueMicrotask(() => {
      if (this.terminated || this.intercept(request, this)) return;
      if (request.kind === 'import') {
        this.sources.set(request.sourceId, request.bytes);
        this.emit({ type: 'result', id: request.id, kind: 'import', result: { pageCount: 2, bytes: request.bytes.slice(0) } });
      } else if (request.kind === 'restore') {
        this.sources.set(request.sourceId, request.bytes);
        this.emit({ type: 'result', id: request.id, kind: 'restore', result: null });
      } else if (request.kind === 'release') {
        request.sourceIds.forEach(id => this.sources.delete(id));
        this.emit({ type: 'result', id: request.id, kind: 'release', result: null });
      } else {
        if (request.groups.flat().some(page => !this.sources.has(page.sourceId))) this.emit({ type: 'error', id: request.id, message: '来源文件缺失' });
        else this.emit({ type: 'result', id: request.id, kind: 'export', result: new TextEncoder().encode(JSON.stringify(request.groups)).buffer });
      }
    });
  }
  emit(data: Response) { this.onmessage?.({ data } as MessageEvent<Response>); }
  crash() { this.onerror?.({ preventDefault() {} } as ErrorEvent); }
  terminate() { this.terminated = true; }
}
const pages = [{ id: 'p2', sourceId: 'a', pageIndex: 1, rotation: 90 }, { id: 'p1', sourceId: 'a', pageIndex: 0, rotation: 0 }];
const clients: PdfClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers(); });
function setup(intercept?: (request: Request, worker: FakeWorker, index: number) => boolean, timeout = 120_000) {
  const workers: FakeWorker[] = [];
  const client = new PdfClient(() => {
    const index = workers.length;
    const worker = new FakeWorker((request, worker) => intercept?.(request, worker, index) ?? false);
    workers.push(worker); return worker;
  }, timeout);
  clients.push(client);
  return { client, workers };
}

describe('PDF task lifecycle', () => {
  it('restores a source if the worker fails immediately after delivering its import result', async () => {
    const { client, workers } = setup((request, worker, index) => {
      if (index === 0 && request.kind === 'import') {
        worker.emit({ type: 'result', id: request.id, kind: 'import', result: { pageCount: 2, bytes: request.bytes.slice(0) } });
        worker.crash(); return true;
      }
      return false;
    });
    await client.import('a', new Blob(['original']));
    await expect(client.export([pages], ['all.pdf'], false)).resolves.toBeInstanceOf(ArrayBuffer);
    expect(workers[1].requests.map(request => request.kind)).toEqual(['restore', 'export']);
  });
  it('restores originals and replays the same export after one worker failure', async () => {
    const { client, workers } = setup((request, worker, index) => {
      if (index === 0 && request.kind === 'export') { worker.crash(); return true; }
      return false;
    });
    await client.import('a', new Blob(['original']));
    const recovered = vi.fn();
    const output = await client.export([pages], ['all.pdf'], false, { onRecovery: recovered });
    expect(JSON.parse(new TextDecoder().decode(output))).toEqual([pages]);
    expect(workers).toHaveLength(2);
    expect(workers[1].requests.map(request => request.kind)).toEqual(['restore', 'export']);
    expect(new TextDecoder().decode(workers[1].sources.get('a'))).toBe('original');
    expect(recovered).toHaveBeenCalled();
  });
  it('attempts only one automatic retry, then supports an explicit recovery', async () => {
    const { client, workers } = setup((request, worker, index) => {
      if (request.kind === 'export' && index < 2) { worker.crash(); return true; }
      return false;
    });
    await client.import('a', new Blob(['original']));
    await expect(client.export([pages], ['all.pdf'], false)).rejects.toBeInstanceOf(WorkerFailure);
    expect(workers).toHaveLength(2);
    await client.recover();
    expect(workers).toHaveLength(3);
    await expect(client.export([pages], ['all.pdf'], false)).resolves.toBeInstanceOf(ArrayBuffer);
  });
  it('cancels immediately, ignores late output, and can export again without reimport', async () => {
    let announce: () => void = () => {};
    const started = new Promise<void>(resolve => { announce = resolve; });
    const { client, workers } = setup((request, _, index) => {
      if (request.kind === 'export' && index === 0) { announce(); return true; }
      return false;
    });
    await client.import('a', new Blob(['original']));
    const controller = new AbortController();
    const pending = client.export([pages], ['all.pdf'], false, { signal: controller.signal });
    const rejected = expect(pending).rejects.toBeInstanceOf(TaskCancelledError);
    await started; controller.abort(); await rejected;
    expect(workers[0].terminated).toBe(true);
    const old = workers[0].requests.at(-1)!;
    workers[0].emit({ type: 'result', kind: 'export', id: old.id, result: new ArrayBuffer(0) });
    const output = await client.export([pages], ['all.pdf'], false);
    expect(JSON.parse(new TextDecoder().decode(output))).toEqual([pages]);
  });
  it('cancels a stalled file read before any worker starts', async () => {
    const { client, workers } = setup();
    const file = new Blob(['original']);
    vi.spyOn(file, 'arrayBuffer').mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = client.import('a', file, { signal: controller.signal });
    const rejected = expect(pending).rejects.toBeInstanceOf(TaskCancelledError);
    controller.abort(); await rejected;
    expect(workers).toHaveLength(0);
  });
  it('does not retry normal PDF validation errors', async () => {
    const { client, workers } = setup((request, worker) => {
      worker.emit({ type: 'error', id: request.id, message: '这是加密 PDF' }); return true;
    });
    await expect(client.import('a', new Blob(['bad']))).rejects.toThrow('加密');
    expect(workers).toHaveLength(1);
  });
  it('times out an unresponsive worker, retries once, and remains retryable', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup(() => true, 100);
    const operation = client.export([pages], ['all.pdf'], false);
    const rejected = expect(operation).rejects.toThrow('长时间没有响应');
    await vi.advanceTimersByTimeAsync(201); await rejected;
    expect(workers).toHaveLength(2);
    expect(workers.every(worker => worker.terminated)).toBe(true);
  });
  it('progress resets the inactivity deadline', async () => {
    vi.useFakeTimers();
    const { client, workers } = setup(() => true, 100);
    const progress = vi.fn();
    const operation = client.export([pages], ['all.pdf'], false, { progress });
    await vi.advanceTimersByTimeAsync(80);
    const request = workers[0].requests[0];
    workers[0].emit({ type: 'progress', id: request.id, done: 1, total: 2 });
    await vi.advanceTimersByTimeAsync(80);
    workers[0].emit({ type: 'result', id: request.id, kind: 'export', result: new ArrayBuffer(4) });
    await expect(operation).resolves.toHaveProperty('byteLength', 4);
    expect(workers).toHaveLength(1);
    expect(progress).toHaveBeenCalledWith(1, 2);
  });
  it('releases history-expired originals and does not restore them after a crash', async () => {
    const { client, workers } = setup();
    await client.import('a', new Blob(['a']));
    await client.import('b', new Blob(['b']));
    client.releaseUnused(new Set(['a']));
    await Promise.resolve(); workers[0].crash(); await client.recover();
    expect([...workers[1].sources.keys()]).toEqual(['a']);
  });
  it('restores after message-deserialization failure', async () => {
    const { client, workers } = setup();
    await client.import('a', new Blob(['a']));
    workers[0].onmessageerror?.({} as MessageEvent);
    await client.recover();
    expect([...workers[1].sources.keys()]).toEqual(['a']);
  });
  it('handles worker construction failure with only one retry', async () => {
    const factory = vi.fn(() => { throw new Error('not available'); });
    const client = new PdfClient(factory); clients.push(client);
    await expect(client.export([pages], ['all.pdf'], false)).rejects.toThrow('无法启动');
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
