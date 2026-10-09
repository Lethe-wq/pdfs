// Run with Node.js 24+. Inputs are synthetic fixtures created by create-fixtures.py.
import { readFile, writeFile } from 'node:fs/promises';
import { exportDocuments, inspectPdf } from '../src/pdf-engine.ts';

const directory = new URL('../tmp/pdfs/', import.meta.url);
const sources = new Map([
  ['a', new Uint8Array(await readFile(new URL('A.pdf', directory)))],
  ['b', new Uint8Array(await readFile(new URL('B.pdf', directory)))],
  ['scan', new Uint8Array(await readFile(new URL('scan-large.pdf', directory)))],
]);
const page = (sourceId, pageIndex, rotation = 0) => ({ id: `${sourceId}-${pageIndex}`, sourceId, pageIndex, rotation });
const merged = [page('a', 2), page('b', 1), page('a', 0, 90), page('a', 1, 90), page('b', 0, 90)];
await writeFile(new URL('verified-merged.pdf', directory), await exportDocuments(sources, [merged], ['merged.pdf'], false));
await writeFile(new URL('verified-selected.pdf', directory), await exportDocuments(sources, [merged.slice(2)], ['selected.pdf'], false));
await writeFile(new URL('verified-split.zip', directory), await exportDocuments(sources, [merged.slice(0, 2), merged.slice(3)], ['part-01.pdf', 'part-02.pdf'], true));
const start = Date.now();
console.log('Scanned input pages:', await inspectPdf(sources.get('scan')));
await writeFile(new URL('verified-scan.pdf', directory), await exportDocuments(sources, [[page('scan', 159), page('scan', 0, 90)]], ['scanned.pdf'], false));
console.log('Scan inspect + extract:', Date.now() - start, 'ms');
console.log('PDF / ZIP outputs written to tmp/pdfs for independent verification.');
