// Node.js 24+. This measures text conversion, not browser responsiveness or memory.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeWordPages } from '../src/word-text.ts';
import { generateWord } from '../src/word-engine.ts';
import { readPageText } from '../src/pdf-text.ts';

const [input = 'tmp/pdfs/word-100.pdf', prefix = 'tmp/pdfs/benchmark-word'] = process.argv.slice(2);
const data = new Uint8Array(await readFile(input));
const inputMiB = +(data.byteLength / 2 ** 20).toFixed(2);
const start = performance.now();
const document = await getDocument({ data, standardFontDataUrl: `${resolve('node_modules/pdfjs-dist/standard_fonts')}/`, cMapUrl: `${resolve('node_modules/pdfjs-dist/cmaps')}/`, cMapPacked: true }).promise;
const pages = [];
for (let i = 0; i < document.numPages; i++) {
  const page = await document.getPage(i + 1);
  const items = await readPageText(page);
  pages.push({ id: `p-${i}`, sourceId: 'benchmark', sourceName: input, pageIndex: i, currentPage: i + 1, items });
}
const analysis = analyzeWordPages(pages);
const checkMs = performance.now() - start;
const generationStart = performance.now();
const buffer = analysis.pages.length ? await generateWord(analysis.pages) : null;
const generateMs = performance.now() - generationStart;
if (buffer) await writeFile(`${prefix}.docx`, Buffer.from(buffer));
await document.destroy();
const report = { pages: pages.length, convertible: analysis.pages.length, skipped: analysis.skipped.length, inputMiB, checkMs: Math.round(checkMs), generateMs: Math.round(generateMs), peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1), scope: 'Node PDF.js + Word engine; excludes browser UI and Worker transfers' };
await writeFile(`${prefix}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
