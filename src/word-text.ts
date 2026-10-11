import type { TextLine } from './text-layout.ts';
import type { WordAnalysis, WordInputPage, WordTextItem } from './word-protocol';

export function textLayout(items: WordTextItem[], id = 'native'): TextLine[] {
  // Project on the dominant text baseline, rather than applying workspace rotation.
  const sample = items.find(item => item.str.trim() && Math.hypot(item.transform[0], item.transform[1]) > 0);
  if (!sample) return [];
  const angle = Math.atan2(sample.transform[1], sample.transform[0]);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const fragments = items.filter(item => item.str.length && item.transform.length >= 6).map((item, order) => {
    const [x, y] = item.transform.slice(4);
    return { item, order, x: x * cos + y * sin, y: y * cos - x * sin, size: Math.max(item.height, Math.hypot(item.transform[0], item.transform[1]), 1) };
  }).sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order);
  const rows: typeof fragments[] = [];
  for (const fragment of fragments) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - fragment.y) <= Math.min(row[0].size, fragment.size) * .3) row.push(fragment);
    else rows.push([fragment]);
  }
  let count = 0;
  return rows.flatMap(row => {
    row.sort((a, b) => a.x - b.x || a.order - b.order);
    const lines: string[] = [];
    let text = '', previous: typeof row[number] | undefined;
    for (const fragment of row) {
      const value = fragment.item.str.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\r\n?/g, '\n');
      const gap = previous ? fragment.x - previous.x - previous.item.width : 0;
      // Insert inferred gaps only between Latin/digit tokens, never between Chinese characters.
      if (previous && /[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(value) && gap > fragment.size * .15) text += ' ';
      text += value;
      if (fragment.item.hasEOL) { if (text.trim()) lines.push(...text.split('\n').map(s => s.trim()).filter(Boolean)); text = ''; previous = undefined; }
      else previous = fragment;
    }
    if (text.trim()) lines.push(...text.split('\n').map(s => s.trim()).filter(Boolean));
    const first = row[0], last = row[row.length - 1];
    return lines.map(text => ({ id:`${id}:native:${count++}`, text, x:first.x, y:first.y,
      width:Math.max(1,last.x + last.item.width - first.x), height:first.size, matrix:[cos,sin,-sin,cos,cos*first.x-sin*first.y,sin*first.x+cos*first.y] }));
  });
}

export function analyzeWordPages(input: WordInputPage[], progress: (done: number, total: number) => void = () => {}): WordAnalysis {
  if (!input.length) throw new Error('没有可转换的页面。');
  const result: WordAnalysis = { pages: [], skipped: [], total: input.length };
  input.forEach(({ items, ...info }, index) => {
    const layout = textLayout(items, info.id), lines = layout.map(line => line.text);
    if (lines.length) result.pages.push({ ...info, lines, layout });
    else result.skipped.push(info);
    progress(index + 1, input.length);
  });
  return result;
}

export function textLines(items:WordTextItem[]):string[] { return textLayout(items).map(line=>line.text); }
