import { getPreview, renderSlot } from './preview';
import { checkCancelled, waitFor } from './task-errors';
import { ocrScale } from './ocr-pages';
import type { RasterGeometry } from './text-drafts';
import type { WordPageInfo } from './word-protocol';

export async function renderOcrRaster(page: WordPageInfo, signal: AbortSignal): Promise<{image:ArrayBuffer;geometry:RasterGeometry}> {
  return renderSlot(async () => {
    checkCancelled(signal);
    const pdf = await waitFor(getPreview(page.sourceId), signal);
    const pdfPage = await waitFor(pdf.getPage(page.pageIndex + 1), signal);
    const natural = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: ocrScale(natural.width, natural.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    const render = pdfPage.render({ canvas, viewport, background: 'rgb(255,255,255)' });
    const abort = () => render.cancel();
    signal.addEventListener('abort', abort, { once: true });
    try {
      checkCancelled(signal); await waitFor(render.promise, signal);
      const blob = await waitFor(new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('无法准备 OCR 页面图像。')), 'image/png')), signal);
      return {image:await waitFor(blob.arrayBuffer(), signal),geometry:{width:canvas.width,height:canvas.height,transform:[...viewport.transform]}};
    } finally {
      signal.removeEventListener('abort', abort); render.cancel();
      canvas.width = 0; canvas.height = 0; pdfPage.cleanup();
    }
  });
}

export async function renderOcrPage(page:WordPageInfo,signal:AbortSignal):Promise<ArrayBuffer> { return (await renderOcrRaster(page,signal)).image; }
