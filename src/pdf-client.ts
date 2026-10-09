import type { PageItem } from './model';
import type { Operation, Operations, Request, Response } from './pdf-protocol';
import { checkCancelled, TaskCancelledError, waitFor, WorkerFailure } from './task-errors';

export interface TaskOptions {
  signal?: AbortSignal;
  onRecovery?: () => void;
  progress?: (done: number, total: number) => void;
}
export interface WorkerPort {
  onmessage: ((event: MessageEvent<Response>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: Request, transfer: Transferable[]): void;
  terminate(): void;
}
interface Pending {
  kind: Operation;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  cleanup: () => void;
  touch: () => void;
  progress?: TaskOptions['progress'];
}

export class PdfClient {
  private worker?: WorkerPort;
  private counter = 0;
  private generation = 0;
  private pending = new Map<number, Pending>();
  // File/Blob references support recovery without a permanent extra byte copy.
  private files = new Map<string, Blob>();
  private loaded = new Set<string>();
  private restoring?: Promise<void>;

  constructor(
    private createWorker: () => WorkerPort = () => new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' }),
    private timeoutMs = 120_000,
  ) {}

  private reset(error: Error) {
    const worker = this.worker;
    this.worker = undefined;
    this.generation++;
    this.loaded.clear();
    worker?.terminate();
    for (const request of this.pending.values()) { request.cleanup(); request.reject(error); }
    this.pending.clear();
  }

  private getWorker() {
    if (!this.worker) {
      const worker = this.createWorker();
      this.worker = worker;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        const request = this.pending.get(data.id);
        if (!request) return;
        request.touch();
        if (data.type === 'progress') { request.progress?.(data.done, data.total); return; }
        this.pending.delete(data.id);
        request.cleanup();
        if (data.type === 'error') request.reject(new Error(data.message));
        else if (data.kind !== request.kind) {
          request.reject(new WorkerFailure('处理进程返回了不匹配的结果。'));
          this.reset(new WorkerFailure());
        } else request.resolve(data.result);
      };
      worker.onerror = event => {
        event.preventDefault();
        if (this.worker === worker) this.reset(new WorkerFailure());
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.reset(new WorkerFailure('无法读取处理进程的结果。'));
      };
    }
    return this.worker;
  }

  private request<K extends Operation>(kind: K, input: Operations[K]['input'], options: TaskOptions = {}, transfer: Transferable[] = []): Promise<Operations[K]['output']> {
    checkCancelled(options.signal);
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const abort = () => this.reset(new TaskCancelledError());
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
      const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.reset(new WorkerFailure('处理任务长时间没有响应，已停止本次任务。')), this.timeoutMs);
      };
      this.pending.set(id, { kind, resolve: value => resolve(value as Operations[K]['output']), reject, cleanup, touch, progress: options.progress });
      options.signal?.addEventListener('abort', abort, { once: true });
      touch();
      try { this.getWorker().postMessage({ id, kind, ...input } as Request, transfer); }
      catch { this.reset(new WorkerFailure('无法启动或连接 PDF 处理进程。')); }
    });
  }

  private async ensureSources(options: TaskOptions) {
    checkCancelled(options.signal);
    if (this.restoring) return this.restoring;
    const missing = [...this.files].filter(([id]) => !this.loaded.has(id));
    if (!missing.length) return;
    options.onRecovery?.();
    const restoration = (async () => {
      for (const [id, file] of missing) {
        const bytes = await waitFor(file.arrayBuffer(), options.signal, this.timeoutMs);
        // Re-read the immutable Blob already validated during import.
        await this.request('restore', { sourceId: id, bytes }, options, [bytes]);
        if (this.files.has(id)) this.loaded.add(id);
      }
    })();
    this.restoring = restoration;
    try { await restoration; }
    catch (error) {
      if (error instanceof TaskCancelledError || error instanceof WorkerFailure) throw error;
      throw new WorkerFailure(`无法重新读取来源文件：${(error as Error).message}`);
    } finally { if (this.restoring === restoration) this.restoring = undefined; }
  }

  private async run<T>(operation: () => Promise<T>, options: TaskOptions): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { await this.ensureSources(options); checkCancelled(options.signal); return await operation(); }
      catch (error) {
        checkCancelled(options.signal);
        if (!(error instanceof WorkerFailure) || attempt === 1) throw error;
        options.onRecovery?.();
      }
    }
  }

  async import(sourceId: string, file: Blob, options: TaskOptions = {}) {
    const imported = await this.run(async () => {
      const bytes = await waitFor(file.arrayBuffer(), options.signal, this.timeoutMs);
      const generation = this.generation;
      const result = await this.request('import', { sourceId, bytes }, options, [bytes]);
      return { result, generation };
    }, options);
    this.files.set(sourceId, file);
    if (imported.generation === this.generation) this.loaded.add(sourceId);
    checkCancelled(options.signal);
    return imported.result;
  }

  releaseUnused(ids: Set<string>) {
    const unused = [...this.files.keys()].filter(id => !ids.has(id));
    unused.forEach(id => { this.files.delete(id); this.loaded.delete(id); });
    if (unused.length && this.worker) void this.request('release', { sourceIds: unused }).catch(() => {});
  }

  export(groups: PageItem[][], filenames: string[], zip: boolean, options: TaskOptions = {}) {
    return this.run(() => this.request('export', { groups, filenames, zip }, options), options);
  }

  recover(options: TaskOptions = {}) { return this.run(async () => {}, options); }
  dispose() { this.reset(new TaskCancelledError()); this.files.clear(); }
}

export const pdfClient = new PdfClient();
