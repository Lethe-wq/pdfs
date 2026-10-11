import { createWorker, OEM } from 'tesseract.js';
import type { Worker, WorkerOptions, ImageLike } from 'tesseract.js';
import type { OcrResult } from './ocr-protocol';

export async function createOcrEngine(options: Partial<WorkerOptions>): Promise<Worker> {
  const worker = await createWorker(['chi_sim', 'eng'], OEM.LSTM_ONLY, options);
  try {
    await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '216' });
    return worker;
  } catch (error) { await worker.terminate(); throw error; }
}
export async function recognizeOcrImage(worker: Worker, image: ImageLike): Promise<OcrResult> {
  let { data } = await worker.recognize(image, { rotateAuto: true }, { text: true, blocks: true, imageGrey: true });
  const sparseOptions={rotateAuto:true,tessedit_pageseg_mode:'11'};
  if (!data.text.trim()) ({data}=await worker.recognize(image,sparseOptions,{text:true,blocks:true,imageGrey:true}));
  let width: number | undefined, height: number | undefined;
  if (data.imageGrey) {
    const png = atob(data.imageGrey.replace(/^data:[^,]+,/, ''));
    if (png.charCodeAt(0) === 137 && png.length > 24) {
      const bytes = Uint8Array.from(png.slice(0, 24), c => c.charCodeAt(0));
      const view = new DataView(bytes.buffer); width = view.getUint32(16); height = view.getUint32(20);
    }
  }
  let paragraph = 0;
  const lines = (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(p => {
    const id = paragraph++;
    return p.lines.map(line => ({ text: line.text.trim(), confidence: line.confidence, bbox: { ...line.bbox }, paragraph: id,
      words: line.words.map(word => ({ text: word.text, confidence: word.confidence, bbox: { ...word.bbox } })) }));
  }));
  return { text: data.text, confidence: data.confidence, lines, rotateRadians: data.rotateRadians ?? 0, imageWidth: width, imageHeight: height };
}
