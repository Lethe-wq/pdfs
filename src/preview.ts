import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { checkCancelled, TaskCancelledError } from './task-errors';

GlobalWorkerOptions.workerSrc = workerUrl;
const documents = new Map<string, PDFDocumentLoadingTask>();
const asset = (path: string) => new URL(`${import.meta.env.BASE_URL}pdf-assets/${path}`, window.location.href).href;

export async function registerPreview(id: string, bytes: ArrayBuffer, signal?: AbortSignal): Promise<PDFDocumentProxy> {
  checkCancelled(signal);
  const task = getDocument({
    data: bytes, cMapUrl: asset('cmaps/'), cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts/'), wasmUrl: asset('wasm/'),
  });
  documents.set(id, task);
  let rejectAbort: (reason: Error) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { void task.destroy().catch(() => {}); rejectAbort(new TaskCancelledError()); };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { void task.destroy().catch(() => {}); rejectAbort(new Error('读取预览超时，请重试。')); }, 120_000);
  try { const doc = await Promise.race([task.promise, aborted]); checkCancelled(signal); return doc; }
  catch (error) { documents.delete(id); void task.destroy().catch(() => {}); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function getPreview(id: string): Promise<PDFDocumentProxy> {
  const task = documents.get(id);
  return task ? task.promise : Promise.reject(new Error('预览不可用，请重新导入该文件。'));
}

export function releasePreviews(ids: Set<string>) {
  for (const [id, task] of documents) {
    if (!ids.has(id)) { documents.delete(id); void task.destroy().catch(() => {}); }
  }
}

let active = 0;
const waiting: (() => void)[] = [];
export async function renderSlot<T>(callback: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try { return await callback(); }
  finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
