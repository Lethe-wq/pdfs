import { checkCancelled, TaskCancelledError, WorkerFailure } from './task-errors.ts';
import type { OcrAssets, OcrRequest, OcrResponse, OcrResult } from './ocr-protocol';

export interface OcrWorkerPort {
  onmessage: ((event: MessageEvent<OcrResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: OcrRequest, transfer: Transferable[]): void;
  terminate(): void;
}
export interface OcrOptions { signal?: AbortSignal; progress?: (fraction: number, status: string) => void; onRecovery?: () => void }
interface Pending { id: number; resolve: (value: OcrResult) => void; reject: (error: Error) => void; cleanup: () => void; touch: () => void; progress?: OcrOptions['progress'] }

export class OcrClient {
  private worker?: OcrWorkerPort;
  private pending?: Pending;
  private counter = 0;
  constructor(private assets: OcrAssets, private createWorker: () => OcrWorkerPort = () => new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' }), private timeoutMs = 120_000) {}
  private reset(error: Error) {
    this.worker?.terminate(); this.worker = undefined;
    const entry = this.pending; this.pending = undefined;
    if (entry) { entry.cleanup(); entry.reject(error); }
  }
  private getWorker() {
    if (!this.worker) {
      const worker = this.createWorker(); this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || this.pending?.id !== data.id) return;
        const entry = this.pending; entry.touch();
        if (data.type === 'progress') { entry.progress?.(data.progress, data.status); return; }
        if (data.type === 'error') { this.reset(new WorkerFailure(`OCR 识别失败：${data.message}`)); return; }
        this.pending = undefined; entry.cleanup(); entry.resolve(data.result);
      };
      worker.onerror = event => { event.preventDefault(); if (this.worker === worker) this.reset(new WorkerFailure('OCR 处理进程意外停止。')); };
      worker.onmessageerror = () => { if (this.worker === worker) this.reset(new WorkerFailure('无法读取 OCR 结果。')); };
    }
    return this.worker;
  }
  private request(image: ArrayBuffer, options: OcrOptions): Promise<OcrResult> {
    checkCancelled(options.signal);
    if (this.pending) return Promise.reject(new Error('OCR 任务正在进行。'));
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => this.reset(new TaskCancelledError());
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const touch = () => { clearTimeout(timer); timer = setTimeout(() => this.reset(new WorkerFailure('OCR 长时间没有响应，请重试。')), this.timeoutMs); };
      this.pending = { id, resolve, reject, cleanup, touch, progress: options.progress };
      options.signal?.addEventListener('abort', abort, { once: true }); touch();
      try {
        const copy = image.slice(0); // Retain the one-page PNG for one automatic retry.
        this.getWorker().postMessage({ id, image: copy, assets: this.assets }, [copy]);
      } catch { this.reset(new WorkerFailure('无法启动 OCR 处理进程。')); }
    });
  }
  async recognize(image: ArrayBuffer, options: OcrOptions = {}): Promise<OcrResult> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.request(image, options); }
      catch (error) { checkCancelled(options.signal); if (!(error instanceof WorkerFailure) || attempt === 1) throw error; options.onRecovery?.(); }
    }
  }
  dispose() { this.reset(new TaskCancelledError()); }
}
