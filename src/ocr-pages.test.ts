import { describe, expect, it, vi } from 'vitest';
import { ocrLines, ocrScale, recognizeMissingPages } from './ocr-pages';
import type { WordAnalysis } from './word-protocol';
const info = (n: number) => ({ id: `p${n}`, currentPage: n, sourceId: `s${n}`, sourceName: `${n}.pdf`, pageIndex: n - 1 });
const original: WordAnalysis = { total: 4, pages: [{ ...info(2), lines: ['native text'] }], skipped: [info(1), info(3), info(4)] };

describe('OCR page processing', () => {
  it('recognizes only missing pages, keeps workspace order and reports blanks', async () => {
    const read = vi.fn().mockResolvedValueOnce({ text: '中文 123\r\nEnglish!', confidence: 91 }).mockResolvedValueOnce({ text: '  \n ', confidence: 0 }).mockResolvedValueOnce({ text: 'last\u0000 page', confidence: 60 });
    const output = await recognizeMissingPages(original, read);
    expect(read.mock.calls.map(call => call[0].id)).toEqual(['p1', 'p3', 'p4']);
    expect(output.pages.map(page => page.id)).toEqual(['p1', 'p2', 'p4']);
    expect(output.pages[0].lines).toEqual(['中文 123', 'English!']);
    expect(output.pages[0].ocr?.confidence).toBe(91);
    expect(output.skipped).toEqual([info(3)]); expect(output.ocrAttempted).toBe(true);
    expect(original.skipped).toHaveLength(3); expect(original.pages).toHaveLength(1);
  });
  it('returns no partial results when one page fails', async () => {
    const read = vi.fn().mockResolvedValueOnce({ text: 'first', confidence: 90 }).mockRejectedValueOnce(new Error('failed'));
    await expect(recognizeMissingPages(original, read)).rejects.toThrow('failed');
    expect(read).toHaveBeenCalledTimes(2); expect(original.pages).toHaveLength(1);
  });
  it('stops scheduling after cancellation and ignores the in-flight result', async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => { controller.abort(); return { text: 'late', confidence: 99 }; });
    await expect(recognizeMissingPages(original, read, controller.signal)).rejects.toMatchObject({ name: 'TaskCancelledError' });
    expect(read).toHaveBeenCalledOnce();
  });
  it('keeps all blank pages skipped and cleans invalid characters', async () => {
    const result = await recognizeMissingPages(original, async () => ({ text: '', confidence: 0 }));
    expect(result.skipped).toHaveLength(3); expect(result.pages).toEqual(original.pages);
    expect(ocrLines('A\u0000B\r\n\n中文 ')).toEqual(['AB', '中文']);
  });
  it('caps raster size without changing aspect ratio and rejects invalid dimensions', () => {
    expect(ocrScale(595, 842)).toBe(3);
    const scale = ocrScale(10000, 8000); expect(10000 * scale).toBeLessThanOrEqual(3500); expect(10000 * 8000 * scale ** 2).toBeLessThanOrEqual(8_000_000);
    expect(() => ocrScale(0, 800)).toThrow('尺寸'); expect(() => ocrScale(Infinity, 800)).toThrow('尺寸');
  });
});
