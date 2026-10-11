// Node.js 24+. Local engine QA only; never sends the PDF or OCR text to a server.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { createOcrEngine, recognizeOcrImage } from '../src/ocr-engine.ts';
import { ocrScale, recognizeMissingPages } from '../src/ocr-pages.ts';
import { readPageText } from '../src/pdf-text.ts';
import { generateWord } from '../src/word-engine.ts';

const [input, output = 'tmp/pdfs/ocr-verification'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/verify-ocr.mjs <local.pdf> [output-prefix]');
await mkdir(dirname(resolve(output)), { recursive: true });
const requirePdf = createRequire(import.meta.resolve('pdfjs-dist/package.json'));
const { createCanvas } = requirePdf('@napi-rs/canvas');
const tess = dirname(fileURLToPath(import.meta.resolve('tesseract.js/package.json')));
const start = performance.now();
const pdf = await getDocument({ data: new Uint8Array(await readFile(input)),
  standardFontDataUrl: `${resolve('public/pdf-assets/standard_fonts')}/`,
  cMapUrl: `${resolve('public/pdf-assets/cmaps')}/`, cMapPacked: true,
  wasmUrl: `${resolve('public/pdf-assets/wasm')}/`,
}).promise;
let worker;
const watchdog = setTimeout(() => { console.error('OCR verification timed out'); process.exit(1); }, 300_000);
try {
  worker = await createOcrEngine({ workerPath: resolve(tess, 'src/worker-script/node/index.js'),
    langPath: resolve('public/ocr-assets/lang'), cacheMethod: 'none',
  });
  const skipped = [];
  for (let index = 0; index < pdf.numPages; index++) {
    const page = await pdf.getPage(index + 1);
    const items = await readPageText(page);
    assert.equal(items.filter(item => item.str?.trim()).length, 0, 'This fixture must have no native text');
    skipped.push({ id: `ocr-${index}`, sourceId: 'local', sourceName: 'local.pdf', pageIndex: index, currentPage: index + 1 });
  }
  const analysis = await recognizeMissingPages({ pages: [], skipped, total: skipped.length }, async info => {
    const page = await pdf.getPage(info.pageIndex + 1);
    const natural = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: ocrScale(natural.width, natural.height) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvas, viewport, background: 'rgb(255,255,255)' }).promise;
      const result = await recognizeOcrImage(worker, canvas.toBuffer('image/png'));
      console.log(JSON.stringify({ page: info.currentPage, characters: result.text.trim().length, confidence: result.confidence }));
      return result;
    } finally { canvas.width = 1; canvas.height = 1; }
  });
  assert.equal(analysis.pages.length, pdf.numPages);
  assert.equal(analysis.skipped.length, 0);
  const blank = createCanvas(600, 800);
  blank.getContext('2d').fillStyle = '#fff'; blank.getContext('2d').fillRect(0, 0, 600, 800);
  assert.equal((await recognizeOcrImage(worker, blank.toBuffer('image/png'))).text.trim(), '');
  const buffer = await generateWord(analysis.pages);
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:pageBreakBefore\/>/g) ?? []).length, pdf.numPages - 1);
  let last = -1;
  for (const page of analysis.pages) {
    const first = page.lines[0].replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    const position = xml.indexOf(first, last + 1);
    assert.ok(position > last, 'Editable page text must appear in the correct order'); last = position;
  }
  await writeFile(`${output}.docx`, Buffer.from(buffer));
  await writeFile(`${output}-text.json`, JSON.stringify(analysis, null, 2));
  console.log(JSON.stringify({ pages: pdf.numPages, recognized: analysis.pages.length, elapsedMs: Math.round(performance.now() - start), peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1), blankPageSkipped: true, editableXmlAndBreaks: true, scope: 'Node PDF.js raster + production OCR configuration + Word engine; browser lifecycle excluded' }));
} finally { clearTimeout(watchdog); await worker?.terminate(); await pdf.destroy(); }
