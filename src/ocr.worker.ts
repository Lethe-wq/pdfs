/// <reference lib="webworker" />
import { createOcrEngine, recognizeOcrImage } from './ocr-engine';
import type { Worker as TesseractWorker } from 'tesseract.js';
import type { OcrRequest, OcrResponse } from './ocr-protocol';

let worker: TesseractWorker | undefined;
let activeId = 0;
const reply = (message: OcrResponse) => self.postMessage(message);
self.onmessage = async ({ data }: MessageEvent<OcrRequest>) => {
  activeId = data.id;
  try {
    worker ??= await createOcrEngine({
      ...data.assets, workerBlobURL: false, cacheMethod: 'none',
      logger: ({ progress, status }) => reply({ id: activeId, type: 'progress', progress, status }),
      errorHandler: error => reply({ id: activeId, type: 'error', message: String(error) }),
    });
    const result = await recognizeOcrImage(worker, new Blob([data.image], { type: 'image/png' }));
    reply({ id: data.id, type: 'result', result });
  } catch (error) { reply({ id: data.id, type: 'error', message: error instanceof Error ? error.message : String(error) }); }
};
