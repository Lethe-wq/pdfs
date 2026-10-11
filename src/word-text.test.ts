import { describe, expect, it } from 'vitest';
import { analyzeWordPages, textLines } from './word-text';
import type { WordInputPage, WordTextItem } from './word-protocol';

const item = (str: string, x: number, y: number, width = str.length * 10, hasEOL = false): WordTextItem => ({ str, dir: 'ltr', transform: [10, 0, 0, 10, x, y], width, height: 10, hasEOL });
const page = (id: string, currentPage: number, items: WordTextItem[]): WordInputPage => ({ id, currentPage, sourceId: 'a', sourceName: '中文.pdf', pageIndex: currentPage - 1, items });
describe('Word text extraction', () => {
  it('reconstructs coordinate order, preserves Chinese and infers English word gaps', () => {
    expect(textLines([item('world 2026!', 45, 80), item('中文，', 0, 100), item('Hello', 0, 80, 30), item('测试。', 35, 100)])).toEqual(['中文，测试。', 'Hello world 2026!']);
  });
  it('keeps fragmented words together and respects explicit line endings', () => {
    expect(textLines([item('Hel', 0, 100, 15), item('lo', 15, 100, 10, true), item('next', 40, 100)])).toEqual(['Hello', 'next']);
  });
  it('reads source-rotated text in its natural baseline direction', () => {
    const rotated = [item('第一行', 0, 100), item('第二行', 0, 80)].map(i => ({ ...i, transform: [0, 10, -10, 0, -i.transform[5], i.transform[4]] }));
    expect(textLines(rotated)).toEqual(['第一行', '第二行']);
  });
  it('returns no text for blank/scan pages and cleans invalid XML control characters', () => {
    expect(textLines([])).toEqual([]); expect(textLines([item('  ', 0, 100)])).toEqual([]);
    expect(textLines([item('A\u0000B\nC', 0, 100)])).toEqual(['AB', 'C']);
  });
  it('preserves workspace sequence and reports original and current page identity when skipping', () => {
    const result = analyzeWordPages([page('b2', 5, [item('B2', 0, 100)]), page('scan', 6, []), page('a1', 8, [item('A1', 0, 100)])]);
    expect(result.pages.map(p => p.id)).toEqual(['b2', 'a1']);
    expect(result.skipped).toEqual([{ id: 'scan', currentPage: 6, sourceId: 'a', sourceName: '中文.pdf', pageIndex: 5 }]);
    expect(result.total).toBe(3);
  });
  it('rejects empty selection and reports all pages without inventing OCR text', () => {
    expect(() => analyzeWordPages([])).toThrow('没有可转换');
    const result = analyzeWordPages([page('scan', 1, []), page('blank', 2, [])]);
    expect(result.pages).toHaveLength(0); expect(result.skipped).toHaveLength(2);
  });
});
