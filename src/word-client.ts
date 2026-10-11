import { checkCancelled, TaskCancelledError, WorkerFailure } from './task-errors';
import type { TaskOptions } from './pdf-client';
import type { WordInputPage, WordOperation, WordOperations, WordPage, WordRequest, WordResponse } from './word-protocol';

export interface WordWorkerPort {
  onmessage: ((event: MessageEvent<WordResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: WordRequest): void;
  terminate(): void;
}
interface Pending { kind: WordOperation; resolve: (value: unknown) => void; reject: (error: Error) => void; cleanup: () => void; touch: () => void; progress?: TaskOptions['progress'] }
export class WordClient {
  private worker?: WordWorkerPort;
  private pending = new Map<number, Pending>();
  private counter = 0;
  constructor(private createWorker: () => WordWorkerPort = () => new Worker(new URL('./word.worker.ts', import.meta.url), { type: 'module' }), private timeoutMs = 120_000) {}
  private reset(error: Error) {
    this.worker?.terminate(); this.worker = undefined;
    for (const entry of this.pending.values()) { entry.cleanup(); entry.reject(error); }
    this.pending.clear();
  }
  private getWorker() {
    if (!this.worker) {
      const worker = this.createWorker(); this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        const entry = this.pending.get(data.id); if (!entry) return;
        entry.touch();
        if (data.type === 'progress') { entry.progress?.(data.done, data.total); return; }
        this.pending.delete(data.id); entry.cleanup();
        if (data.type === 'error') entry.reject(new Error(data.message));
        else if (data.kind === entry.kind) entry.resolve(data.result);
        else { entry.reject(new WorkerFailure('Word 处理进程返回了不匹配的结果。')); this.reset(new WorkerFailure()); }
      };
      worker.onerror = event => { event.preventDefault(); if (this.worker === worker) this.reset(new WorkerFailure('Word 处理进程意外停止。')); };
      worker.onmessageerror = () => { if (this.worker === worker) this.reset(new WorkerFailure('无法读取 Word 处理结果。')); };
    }
    return this.worker;
  }
  private request<K extends WordOperation>(kind: K, input: WordOperations[K]['input'], options: TaskOptions): Promise<WordOperations[K]['output']> {
    checkCancelled(options.signal);
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => this.reset(new TaskCancelledError());
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const touch = () => { clearTimeout(timer); timer = setTimeout(() => this.reset(new WorkerFailure('Word 转换长时间没有响应，请重试。')), this.timeoutMs); };
      this.pending.set(id, { kind, resolve: value => resolve(value as WordOperations[K]['output']), reject, touch, cleanup, progress: options.progress });
      options.signal?.addEventListener('abort', abort, { once: true }); touch();
      try { this.getWorker().postMessage({ id, kind, ...input } as WordRequest); }
      catch { this.reset(new WorkerFailure('无法启动 Word 处理进程。')); }
    });
  }
  private async run<K extends WordOperation>(kind: K, input: WordOperations[K]['input'], options: TaskOptions) {
    for (let attempt = 0; ; attempt++) {
      try { return await this.request(kind, input, options); }
      catch (error) {
        checkCancelled(options.signal);
        if (!(error instanceof WorkerFailure) || attempt === 1) throw error;
        options.onRecovery?.();
      }
    }
  }
  analyze(pages: WordInputPage[], options: TaskOptions = {}) { return this.run('analyze', { pages }, options); }
  generate(pages: WordPage[], options: TaskOptions = {}) { return this.run('generate', { pages }, options); }
  dispose() { this.reset(new TaskCancelledError()); }
}
