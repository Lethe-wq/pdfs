import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import { inspectPdf, exportDocuments } from './pdf-engine';
import type { PageItem } from './model';
import { readFileSync } from 'node:fs';

async function fixture(count: number, baseWidth = 500, initialRotation = 0) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < count; index++) {
    const page = document.addPage([baseWidth + index * 10, 700]);
    page.drawText(`PAGE ${index + 1}`, { x: 30, y: 650, font });
    page.setRotation(degrees(initialRotation));
  }
  return document.save();
}
const page = (sourceId: string, pageIndex: number, rotation = 0): PageItem => ({ id: `${sourceId}-${pageIndex}`, sourceId, pageIndex, rotation });

describe('PDF exports', () => {
  it('distinguishes encrypted PDFs from corrupted files', async () => {
    const encrypted = readFileSync(new URL('../tests/fixtures/encrypted.pdf', import.meta.url));
    await expect(inspectPdf(encrypted)).rejects.toThrow('这是加密 PDF');
  });
  it('merges in workspace order, preserves mixed sizes and adds rotation to source rotation', async () => {
    const sources = new Map([['a', await fixture(3)], ['b', await fixture(2, 800, 90)]]);
    const output = await exportDocuments(sources, [[page('b', 1, 90), page('a', 2), page('a', 0)]], ['merged.pdf'], false);
    const result = await PDFDocument.load(output);
    expect(result.getPageCount()).toBe(3);
    expect(result.getPages().map(page => page.getWidth())).toEqual([810, 520, 500]);
    expect(result.getPages().map(page => page.getRotation().angle)).toEqual([180, 0, 0]);
  });
  it('generates a complete ZIP with one valid PDF per group', async () => {
    const sources = new Map([['a', await fixture(4)]]);
    const progress: number[] = [];
    const output = await exportDocuments(sources, [[page('a', 2)], [page('a', 0), page('a', 3)]], ['one.pdf', 'two.pdf'], true, done => progress.push(done));
    const zip = await JSZip.loadAsync(output);
    expect(Object.keys(zip.files)).toEqual(['one.pdf', 'two.pdf']);
    expect((await PDFDocument.load(await zip.file('one.pdf')!.async('uint8array'))).getPageCount()).toBe(1);
    expect((await PDFDocument.load(await zip.file('two.pdf')!.async('uint8array'))).getPageCount()).toBe(2);
    expect(progress.at(-1)).toBe(3);
  });
  it('rejects a missing source or empty group instead of returning a partial file', async () => {
    const sources = new Map([['a', await fixture(1)]]);
    await expect(exportDocuments(sources, [[page('a', 0)], [page('missing', 0)]], ['one.pdf', 'two.pdf'], true)).rejects.toThrow('来源文件');
    await expect(exportDocuments(sources, [[]], ['empty.pdf'], false)).rejects.toThrow('没有可导出');
  });
  it('validates ordinary PDFs and rejects broken and empty files', async () => {
    expect(await inspectPdf(await fixture(2))).toBe(2);
    await expect(inspectPdf(new Uint8Array([0, 1, 2]))).rejects.toThrow('无法读取');
    const empty = await PDFDocument.create();
    await expect(inspectPdf(await empty.save({ addDefaultPage: false }))).rejects.toThrow('没有可用');
  });
  it('preserves interleaved sources and independent rotations of repeated original pages', async () => {
    const sources = new Map([['a', await fixture(3)], ['b', await fixture(2, 800, 90)]]);
    const output = await exportDocuments(sources, [[page('a', 2), page('b', 0, 90), page('a', 0, 90), page('a', 0, 180)]], ['all.pdf'], false);
    const result = await PDFDocument.load(output);
    expect(result.getPages().map(page => page.getWidth())).toEqual([520, 800, 500, 500]);
    expect(result.getPages().map(page => page.getRotation().angle)).toEqual([0, 180, 90, 180]);
  });
  it('reuses a shared font resource across pages copied from one source', async () => {
    const output = await exportDocuments(new Map([['a', await fixture(20)]]), [Array.from({ length: 20 }, (_, index) => page('a', index))], ['all.pdf'], false);
    const result = await PDFDocument.load(output);
    // One embedded Helvetica font should remain shared in the exported resources.
    const fontObjects = result.context.enumerateIndirectObjects().filter(([, object]) => object.toString().includes('/Type /Font'));
    expect(fontObjects).toHaveLength(1);
  });
  it('rejects conflicting filenames, invalid grouping and original page bounds', async () => {
    const sources = new Map([['a', await fixture(1)]]);
    await expect(exportDocuments(sources, [[page('a', 0)], [page('a', 0)]], ['same.pdf', 'same.pdf'], true)).rejects.toThrow('文件名');
    await expect(exportDocuments(sources, [[page('a', 0)], [page('a', 0)]], ['a.pdf', 'b.pdf'], false)).rejects.toThrow('文件名');
    await expect(exportDocuments(sources, [[page('a', 3)]], ['a.pdf'], false)).rejects.toThrow('越界');
  });
});
