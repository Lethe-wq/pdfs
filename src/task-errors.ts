export class TaskCancelledError extends Error {
  constructor() { super('操作已取消。'); this.name = 'TaskCancelledError'; }
}
export class WorkerFailure extends Error {
  constructor(message = '处理进程意外停止。') { super(message); this.name = 'WorkerFailure'; }
}
export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new TaskCancelledError();
}

export function waitFor<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = 120_000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => finish(() => reject(new TaskCancelledError()));
    const timer = setTimeout(() => finish(() => reject(new Error('读取文件超时，请重试。'))), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}
