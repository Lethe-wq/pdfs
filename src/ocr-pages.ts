import type { WordAnalysis, WordPageInfo } from './word-protocol';
import type { OcrResult } from './ocr-protocol';
import { checkCancelled, TaskCancelledError } from './task-errors.ts';

export function ocrScale(width: number, height: number): number {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) throw new Error('页面尺寸无效。');
  return Math.min(3, 3500 / Math.max(width, height), Math.sqrt(8_000_000 / (width * height)));
}
export const ocrLines = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);

export async function recognizeMissingPages(
  analysis: WordAnalysis, recognize: (page: WordPageInfo, index: number, total: number) => Promise<OcrResult>, signal?: AbortSignal,
): Promise<WordAnalysis> {
  const pages = [...analysis.pages], skipped: WordPageInfo[] = [];
  for (let index = 0; index < analysis.skipped.length; index++) {
    checkCancelled(signal);
    const page = analysis.skipped[index];
    let result: OcrResult;
    try { result = await recognize(page, index, analysis.skipped.length); }
    catch (error) {
      checkCancelled(signal);
      if (error instanceof TaskCancelledError) throw error;
      throw new Error(`当前第 ${page.currentPage} 页（${page.sourceName}，原第 ${page.pageIndex + 1} 页）：${error instanceof Error ? error.message : String(error)}`);
    }
    checkCancelled(signal);
    const lines = ocrLines(result.text);
    if (lines.some(line => /[\p{L}\p{N}]/u.test(line))) pages.push({ ...page, lines, ocr: { confidence: Number.isFinite(result.confidence) ? Math.max(0, Math.min(100, result.confidence)) : 0 } });
    else skipped.push(page);
  }
  checkCancelled(signal);
  return { ...analysis, pages: pages.sort((a, b) => a.currentPage - b.currentPage), skipped, ocrAttempted: true };
}
