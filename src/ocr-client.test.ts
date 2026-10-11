import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrClient } from './ocr-client';
import type { OcrWorkerPort } from './ocr-client';
import type { OcrRequest, OcrResponse } from './ocr-protocol';
const assets = { corePath: '/ocr/core/', workerPath: '/ocr/worker.js', langPath: '/ocr/lang/' };
class Port implements OcrWorkerPort {
  onmessage: OcrWorkerPort['onmessage'] = null; onerror: OcrWorkerPort['onerror'] = null; onmessageerror: OcrWorkerPort['onmessageerror'] = null;
  requests: OcrRequest[] = []; terminate = vi.fn();
  postMessage(request: OcrRequest) { this.requests.push(request); }
  reply(value: OcrResponse) { this.onmessage?.({ data: value } as MessageEvent<OcrResponse>); }
  result(text = '中文') { this.reply({ id: this.requests.at(-1)!.id, type: 'result', result: { text, confidence: 90 } }); }
  crash() { this.onerror?.({ preventDefault() {} } as ErrorEvent); }
}
const setup = () => { const ports: Port[] = []; const client = new OcrClient(assets, () => { const port = new Port(); ports.push(port); return port; }, 100); return { client, ports }; };
afterEach(() => vi.useRealTimers());
describe('OCR Worker lifecycle', () => {
  it('reuses one worker across pages and retains the PNG for retry', async () => {
    const { client, ports } = setup(); const bytes = new Uint8Array([1, 2, 3]).buffer;
    const first = client.recognize(bytes); ports[0].result(); await expect(first).resolves.toMatchObject({ text: '中文' });
    const second = client.recognize(bytes); ports[0].result('English'); await second;
    expect(ports).toHaveLength(1); expect(ports[0].requests).toHaveLength(2);
    expect(ports[0].requests[0].image).not.toBe(bytes); expect(bytes.byteLength).toBe(3); client.dispose();
  });
  it('retries a worker crash exactly once and permits a later manual retry', async () => {
    const { client, ports } = setup(); const recovery = vi.fn();
    const first = client.recognize(new ArrayBuffer(2), { onRecovery: recovery }); const rejected = expect(first).rejects.toThrow('意外停止');
    ports[0].crash(); await Promise.resolve(); ports[1].crash(); await rejected;
    expect(recovery).toHaveBeenCalledOnce(); expect(ports[0].terminate).toHaveBeenCalledOnce();
    const second = client.recognize(new ArrayBuffer(2)); ports[2].result(); await second; client.dispose();
  });
  it('cancels during model loading, ignores late results and supports the next task', async () => {
    const { client, ports } = setup(); const controller = new AbortController();
    const first = client.recognize(new ArrayBuffer(1), { signal: controller.signal }); const rejected = expect(first).rejects.toMatchObject({ name: 'TaskCancelledError' });
    controller.abort(); await rejected; expect(ports).toHaveLength(1); expect(ports[0].terminate).toHaveBeenCalledOnce();
    const second = client.recognize(new ArrayBuffer(1)); ports[0].result('late'); ports[1].result('next');
    await expect(second).resolves.toMatchObject({ text: 'next' }); client.dispose();
  });
  it('uses progress to reset the inactivity timeout and still stops stalled workers', async () => {
    vi.useFakeTimers(); const { client, ports } = setup();
    const first = client.recognize(new ArrayBuffer(1)); const rejected = expect(first).rejects.toThrow('长时间');
    await vi.advanceTimersByTimeAsync(80); ports[0].reply({ id: 1, type: 'progress', progress: .5, status: 'recognizing text' });
    await vi.advanceTimersByTimeAsync(80); expect(ports).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(21); expect(ports).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(101); await rejected; client.dispose();
  });
});
