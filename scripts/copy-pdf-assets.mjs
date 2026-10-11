import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const source = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const target = fileURLToPath(new URL('../public/pdf-assets/', import.meta.url));
await mkdir(target, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(source, directory), join(target, directory), { recursive: true });
}
console.log('PDF 预览资源已准备好（本地加载）。');

// OCR runtime and models are same-origin assets, never runtime CDN downloads.
const tess = dirname(fileURLToPath(import.meta.resolve('tesseract.js/package.json')));
const requireTess = createRequire(join(tess, 'package.json'));
const core = dirname(requireTess.resolve('tesseract.js-core/package.json'));
const ocr = fileURLToPath(new URL('../public/ocr-assets/', import.meta.url));
await mkdir(join(ocr, 'core'), { recursive: true });
await mkdir(join(ocr, 'lang'), { recursive: true });
await cp(join(tess, 'dist/worker.min.js'), join(ocr, 'worker.min.js'));
await cp(join(tess, 'LICENSE.md'), join(ocr, 'TESSERACT-JS-LICENSE.md'));
await cp(join(core, 'LICENSE'), join(ocr, 'TESSERACT-CORE-LICENSE'));
for (const variant of ['', '-simd', '-relaxedsimd', '-lstm', '-simd-lstm', '-relaxedsimd-lstm']) {
  for (const suffix of ['.wasm.js', '.wasm']) await cp(join(core, `tesseract-core${variant}${suffix}`), join(ocr, 'core', `tesseract-core${variant}${suffix}`));
}
for (const lang of ['chi_sim', 'eng']) {
  const pkg = dirname(fileURLToPath(import.meta.resolve(`@tesseract.js-data/${lang}/package.json`)));
  await cp(join(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`), join(ocr, 'lang', `${lang}.traineddata.gz`));
}
console.log('OCR 引擎和中英文模型已准备好（本地加载）。');
