import type { PageItem, SourceFile } from './model';
import { checkCancelled, TaskCancelledError, WorkerFailure } from './task-errors';

interface ImportOptions {
  signal: AbortSignal;
  initialCount: number;
  read: (id: string, file: File) => Promise<{ pageCount: number; bytes: ArrayBuffer }>;
  preview: (id: string, bytes: ArrayBuffer) => Promise<unknown>;
  progress: (index: number, total: number, name: string) => void;
}
export async function importBatch(files: File[], options: ImportOptions) {
  const sources: SourceFile[] = [];
  const pages: PageItem[] = [];
  const errors: string[] = [];
  let cancelled = false;
  let unavailable = false;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const id = crypto.randomUUID();
    try {
      checkCancelled(options.signal);
      options.progress(index, files.length, file.name);
      if (!/\.pdf$/i.test(file.name)) throw new Error('请选择 .pdf 文件。');
      const result = await options.read(id, file);
      checkCancelled(options.signal);
      await options.preview(id, result.bytes);
      checkCancelled(options.signal);
      sources.push({ id, name: file.name, pageCount: result.pageCount, size: file.size, color: options.initialCount + sources.length });
      for (let pageIndex = 0; pageIndex < result.pageCount; pageIndex++) {
        pages.push({ id: crypto.randomUUID(), sourceId: id, pageIndex, rotation: 0 });
      }
    } catch (error) {
      if (options.signal.aborted || error instanceof TaskCancelledError) { cancelled = true; break; }
      errors.push(`${file.name}：${(error as Error).message}`);
      if (error instanceof WorkerFailure) { unavailable = true; break; }
    }
  }
  return { sources, pages, errors, cancelled, unavailable };
}
