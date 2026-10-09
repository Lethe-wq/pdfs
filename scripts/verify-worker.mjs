// Run after pnpm build, using Node.js 24+.
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
await mkdir('tmp/pdfs', { recursive: true });
await build({ entryPoints: ['src/pdf-client.ts'], outfile: 'tmp/pdfs/test-client.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { PdfClient } = await import('../tmp/pdfs/test-client.mjs');
const entry = (await readdir('dist/assets')).find(name => /^pdf\.worker-[^.]+\.js$/.test(name));
assert(entry, 'Build the production Worker first');
const workerEntry = pathToFileURL(resolve('dist/assets', entry)).href;
let attempts = 0;
let exportStarted = () => {};
const ports = [];
class Port {
  onmessage = null; onerror = null; onmessageerror = null;
  constructor(failExport) {
    this.thread = new Worker(new URL('../tests/worker-host.mjs', import.meta.url), { workerData: { entry: workerEntry, failExport } });
    this.thread.on('message', data => this.onmessage?.({ data }));
    this.thread.on('error', error => {
      if (error.message !== 'Injected worker failure') console.error('Worker host error:', error.message);
      this.onerror?.({ preventDefault() {} });
    });
    this.thread.on('messageerror', () => this.onmessageerror?.({}));
  }
  postMessage(message, transfer) { this.thread.postMessage(message, transfer); if (message.kind === 'export') exportStarted(); }
  terminate() { void this.thread.terminate(); }
}
const client = new PdfClient(() => { const port = new Port(attempts++ === 0); ports.push(port); return port; });
async function fixture(name, count, width) {
  const doc = await PDFDocument.create();
  for (let index = 0; index < count; index++) doc.addPage([width + index * 10, 700]).drawText(`${name} - PAGE ${index + 1}`);
  return new Blob([await doc.save()]);
}
try {
  await client.import('a', await fixture('A', 3, 500));
  await client.import('b', await fixture('B', 2, 800));
  const page = (sourceId, pageIndex, rotation = 0) => ({ id: `${sourceId}-${pageIndex}`, sourceId, pageIndex, rotation });
  const pages = [page('b', 1, 90), page('a', 2), page('a', 0)];
  let recoveries = 0;
  const output = await client.export([pages], ['recovered.pdf'], false, { onRecovery: () => recoveries++ });
  const pdf = await PDFDocument.load(output);
  assert.equal(ports.length, 2); assert(recoveries > 0);
  assert.deepEqual(pdf.getPages().map(page => [page.getWidth(), page.getRotation().angle]), [[810, 90], [520, 0], [500, 0]]);
  await writeFile('tmp/pdfs/worker-recovered.pdf', new Uint8Array(output));
  const controller = new AbortController();
  const started = new Promise(resolve => { exportStarted = resolve; });
  const cancelled = client.export([pages], ['cancelled.pdf'], false, { signal: controller.signal });
  const rejection = assert.rejects(cancelled, error => error.name === 'TaskCancelledError');
  await started; controller.abort(); await rejection;
  const restored = await client.export([pages], ['after-cancel.pdf'], false);
  assert.equal((await PDFDocument.load(restored)).getPageCount(), 3);
  await writeFile('tmp/pdfs/worker-after-cancel.pdf', new Uint8Array(restored));
  console.log('Production Worker: real crash → original-file recovery → exact export; cancellation → next export: passed.');
} finally { client.dispose(); }
