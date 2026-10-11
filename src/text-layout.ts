export type TextStyle = 'body' | 'heading1' | 'heading2' | 'bullet' | 'number';
export interface TextLine {
  id: string; text: string; x: number; y: number; width: number; height: number;
  words?: {text:string;confidence:number;corners:number[][]}[];
  matrix?: number[]; confidence?: number; paragraph?: number; newParagraph?: boolean; style?: TextStyle;
}
export interface TextParagraph { text: string; style: TextStyle }
export function joinText(a: string, b: string) {
  return a + (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? ' ' : '') + b;
}
export function inferStyle(line: TextLine, median: number): TextStyle {
  if (/^\s*[•●▪\-]\s+/.test(line.text)) return 'bullet';
  if (/^\s*(?:\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/.test(line.text)) return 'number';
  if (line.text.length < 60 && line.height >= median * 1.45) return 'heading1';
  if (line.text.length < 60 && line.height >= median * 1.2) return 'heading2';
  return 'body';
}
export function paragraphs(lines: TextLine[], originalLines = false): TextParagraph[] {
  const heights = lines.map(l => l.height).filter(h => h > 0).sort((a,b) => a-b);
  const median = heights[Math.floor(heights.length / 2)] || 11;
  const output: TextParagraph[] = [];
  let prev: TextLine | undefined;
  for (const line of lines) {
    const text = line.text.trim(); if (!text) continue;
    const style = line.style ?? inferStyle(line, median);
    const gap = prev ? Math.abs(prev.y - line.y) : Infinity;
    const boundary = originalLines || !prev || line.newParagraph || style !== 'body' || output.at(-1)?.style !== 'body'
      || (line.paragraph !== undefined && line.paragraph !== prev.paragraph)
      || gap > Math.max(line.height, prev.height) * 1.9
      || Math.abs(line.x - prev.x) > Math.max(line.height, prev.height) * 1.5;
    if (boundary) output.push({ text, style });
    else output[output.length - 1].text = joinText(output[output.length - 1].text, text);
    prev = line;
  }
  return output;
}
