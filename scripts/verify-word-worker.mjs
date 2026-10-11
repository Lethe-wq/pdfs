// Node.js 24+, after pnpm build. Runs the exact Vite Word Worker bundle.
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
await mkdir('tmp/pdfs', { recursive: true });
await build({ entryPoints: ['src/word-client.ts'], outfile: 'tmp/pdfs/test-word-client.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
const { WordClient } = await import('../tmp/pdfs/test-word-client.mjs');
const entry = (await readdir('dist/assets')).find(name => /^word\.worker-[^.]+\.js$/.test(name));
assert(entry, 'Build the production Word Worker first');
const workerEntry = pathToFileURL(resolve('dist/assets', entry)).href;
let attempts = 0, generated = () => {};
class Port {
  onmessage = null; onerror = null; onmessageerror = null;
  constructor() {
    this.thread = new Worker(new URL('../tests/worker-host.mjs', import.meta.url), { workerData: { entry: workerEntry, failKind: attempts++ === 0 ? 'generate' : null } });
    this.thread.on('message', data => this.onmessage?.({ data }));
    this.thread.on('error', error => { if (error.message !== 'Injected worker failure') console.error(error.message); this.onerror?.({ preventDefault() {} }); });
    this.thread.on('messageerror', () => this.onmessageerror?.({}));
  }
  postMessage(message) { this.thread.postMessage(message); if (message.kind === 'generate') generated(); }
  terminate() { void this.thread.terminate(); }
}
const client = new WordClient(() => new Port());
const input = ['中文，<测试>& ABC 123', '', 'Last page'].map((str, index) => ({ id: `p${index}`, sourceId: 'a', sourceName: 'synthetic.pdf', pageIndex: index, currentPage: index + 1, items: str ? [{ str, dir: 'ltr', transform: [11, 0, 0, 11, 30, 700], width: 100, height: 11, hasEOL: true }] : [] }));
try {
  const analysis = await client.analyze(input);
  assert.equal(analysis.skipped[0].currentPage, 2); assert.equal(analysis.pages.length, 2);
  const output = await client.generate(analysis.pages);
  assert.equal(attempts, 2);
  const xml = await (await JSZip.loadAsync(output)).file('word/document.xml').async('string');
  assert(xml.includes('中文，&lt;测试&gt;&amp; ABC 123')); assert(xml.includes('Last page')); assert.equal((xml.match(/<w:pageBreakBefore\b/g) ?? []).length, 1);
  await writeFile('tmp/pdfs/word-worker-verified.docx', new Uint8Array(output));
  const controller = new AbortController();
  const started = new Promise(resolve => { generated = resolve; });
  const pending = client.generate(analysis.pages, { signal: controller.signal });
  const rejection = assert.rejects(pending, error => error.name === 'TaskCancelledError');
  await started; controller.abort(); await rejection;
  const next = await client.generate(analysis.pages);
  assert((await JSZip.loadAsync(next)).file('word/document.xml'));
  console.log('Production Word Worker: analysis, real crash → retry, editable DOCX, cancel → next generation: passed.');
} finally { client.dispose(); }
