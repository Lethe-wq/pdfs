import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateWord } from './word-engine';
import { analyzeWordPages } from './word-text';
import type { WordPage } from './word-protocol';

const page = (id: string, lines: string[]): WordPage => ({ id, sourceId: id, sourceName: `${id}.pdf`, pageIndex: 0, currentPage: 1, lines });
describe('Word generation', () => {
  it('creates editable XML with Chinese, escaped punctuation, stable page order and source-page breaks', async () => {
    const zip = await JSZip.loadAsync(await generateWord([page('b', ['中文 ABC 123，<测试>&', '第二行']), page('a', ['Next page'])]));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('中文 ABC 123，&lt;测试&gt;&amp;');
    expect(xml.indexOf('中文')).toBeLessThan(xml.indexOf('第二行')); expect(xml.indexOf('第二行')).toBeLessThan(xml.indexOf('Next page'));
    expect(xml.match(/<w:pageBreakBefore\b/g)).toHaveLength(1);
    expect(xml).toContain('w:sz w:val="22"'); expect(xml).toContain('w:eastAsia="宋体"');
    expect(xml).toContain('w:w="11906"'); expect(xml).toContain('w:h="16838"');
    expect(xml).not.toContain('<w:drawing');
  });
  it('excludes skipped pages and adds no trailing break', async () => {
    const input = ['one', '', 'three'].map((str, index) => ({ ...page(String(index), []), items: str ? [{ str, dir: 'ltr', transform: [10, 0, 0, 10, 0, 100], width: 20, height: 10, hasEOL: true }] : [] }));
    const analysis = analyzeWordPages(input);
    const xml = await (await JSZip.loadAsync(await generateWord(analysis.pages))).file('word/document.xml')!.async('string');
    expect(analysis.skipped).toHaveLength(1); expect(xml.match(/<w:t\b/g)).toHaveLength(2); expect(xml.match(/<w:pageBreakBefore\b/g)).toHaveLength(1);
  });
  it('rejects empty or invalid text pages rather than generating partial output', async () => {
    await expect(generateWord([])).rejects.toThrow('没有有效');
    await expect(generateWord([page('a', ['good']), page('b', [])])).rejects.toThrow('没有有效');
  });
});
