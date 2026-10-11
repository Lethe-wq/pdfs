import { afterEach, describe, expect, it, vi } from 'vitest';
import { WordClient, type WordWorkerPort } from './word-client';
import type { WordRequest, WordResponse } from './word-protocol';

class Port implements WordWorkerPort {
  onmessage: WordWorkerPort['onmessage'] = null; onerror: WordWorkerPort['onerror'] = null; onmessageerror: WordWorkerPort['onmessageerror'] = null;
  requests: WordRequest[] = []; terminate = vi.fn();
  postMessage(request: WordRequest) { this.requests.push(request); }
  reply(data: WordResponse) { this.onmessage?.({ data } as MessageEvent<WordResponse>); }
  crash() { this.onerror?.({ preventDefault() {} } as ErrorEvent); }
}
const pages = [{ id: 'p', sourceId: 'a', sourceName: 'A.pdf', pageIndex: 0, currentPage: 1, lines: ['hello'] }];
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
describe('Word Worker client', () => {
  it('replays the same text once after a crash without PDF bytes', async () => {
    const ports: Port[] = []; const client = new WordClient(() => { const port = new Port(); ports.push(port); return port; });
    const pending = client.generate(pages); ports[0].crash(); await tick();
    expect(ports).toHaveLength(2); expect(ports[1].requests[0]).toMatchObject({ kind: 'generate', pages });
    const request = ports[1].requests[0]; ports[1].reply({ type: 'result', id: request.id, kind: 'generate', result: new ArrayBuffer(4) });
    expect((await pending).byteLength).toBe(4); client.dispose();
  });
  it('fails after two crashes, then permits an explicit retry', async () => {
    const ports: Port[] = []; const client = new WordClient(() => { const p = new Port(); ports.push(p); return p; });
    const pending = client.generate(pages); const rejected = expect(pending).rejects.toMatchObject({ name: 'WorkerFailure' });
    ports[0].crash(); await tick(); ports[1].crash(); await rejected;
    const retry = client.generate(pages); const req = ports[2].requests[0]; ports[2].reply({ type: 'result', id: req.id, kind: 'generate', result: new ArrayBuffer(1) });
    expect((await retry).byteLength).toBe(1); client.dispose();
  });
  it('terminates on cancel, ignores late responses and can generate again', async () => {
    const ports: Port[] = []; const client = new WordClient(() => { const p = new Port(); ports.push(p); return p; });
    const controller = new AbortController(); const pending = client.generate(pages, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TaskCancelledError' }); controller.abort(); await rejected;
    expect(ports[0].terminate).toHaveBeenCalledTimes(1);
    const next = client.generate(pages); ports[0].reply({ type: 'result', id: ports[0].requests[0].id, kind: 'generate', result: new ArrayBuffer(100) });
    ports[1].reply({ type: 'result', id: ports[1].requests[0].id, kind: 'generate', result: new ArrayBuffer(2) });
    expect((await next).byteLength).toBe(2); client.dispose();
  });
  it('times out twice and resets the inactivity deadline on progress', async () => {
    vi.useFakeTimers(); const ports: Port[] = []; const progress = vi.fn();
    const client = new WordClient(() => { const p = new Port(); ports.push(p); return p; }, 100);
    const pending = client.generate(pages, { progress }); const rejected = expect(pending).rejects.toThrow('长时间');
    await vi.advanceTimersByTimeAsync(80); ports[0].reply({ type: 'progress', id: ports[0].requests[0].id, done: 1, total: 1 });
    await vi.advanceTimersByTimeAsync(80); expect(ports).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(120); await rejected; expect(ports).toHaveLength(2); expect(progress).toHaveBeenCalledWith(1, 1); client.dispose();
  });
  it('does not retry domain errors', async () => {
    const factory = vi.fn(() => new Port()); const client = new WordClient(factory);
    const pending = client.generate(pages); factory.mock.results[0].value.reply({ type: 'error', id: 1, message: 'No text' });
    await expect(pending).rejects.toThrow('No text'); expect(factory).toHaveBeenCalledTimes(1); client.dispose();
  });
});
