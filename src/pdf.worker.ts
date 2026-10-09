/// <reference lib="webworker" />
import { inspectPdf, exportDocuments } from './pdf-engine';
import { transferableBuffer, type Request, type Response } from './pdf-protocol';

const sources = new Map<string, Uint8Array>();
const reply = (response: Response, transfer: Transferable[] = []) => self.postMessage(response, transfer);

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  const { id, kind } = data;
  try {
    if (kind === 'import') {
      const bytes = new Uint8Array(data.bytes);
      const pageCount = await inspectPdf(bytes);
      sources.set(data.sourceId, bytes);
      const previewBytes = bytes.slice().buffer;
      reply({ type: 'result', id, kind, result: { pageCount, bytes: previewBytes } }, [previewBytes]);
    } else if (kind === 'restore') {
      sources.set(data.sourceId, new Uint8Array(data.bytes));
      reply({ type: 'result', id, kind, result: null });
    } else if (kind === 'release') {
      for (const sourceId of data.sourceIds) sources.delete(sourceId);
      reply({ type: 'result', id, kind, result: null });
    } else {
      const result = await exportDocuments(sources, data.groups, data.filenames, data.zip, (done, total) => {
        reply({ type: 'progress', id, done, total });
      });
      const buffer = transferableBuffer(result);
      reply({ type: 'result', id, kind, result: buffer }, [buffer]);
    }
  } catch (error) {
    reply({ type: 'error', id, message: error instanceof Error ? error.message : 'PDF 处理失败，请重试。' });
  }
};
