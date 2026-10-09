import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const source = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
const target = fileURLToPath(new URL('../public/pdf-assets/', import.meta.url));
await mkdir(target, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(source, directory), join(target, directory), { recursive: true });
}
console.log('PDF 预览资源已准备好（本地加载）。');
