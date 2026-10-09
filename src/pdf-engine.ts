import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';
import type { PageItem } from './model';

export async function inspectPdf(bytes: Uint8Array): Promise<number> {
  let doc: PDFDocument;
  try {
    // Read the encryption marker only; encrypted content is never rendered or exported.
    // pdf-lib's transpiled Error subclasses do not reliably support instanceof.
    doc = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true, ignoreEncryption: true });
  } catch {
    throw new Error('无法读取 PDF，文件可能已损坏或不是有效的 PDF。');
  }
  if (doc.isEncrypted) throw new Error('这是加密 PDF，当前版本暂不支持。请先使用原密码解密后再导入。');
  if (!doc.getPageCount()) throw new Error('这个 PDF 没有可用的页面。');
  return doc.getPageCount();
}

export async function exportDocuments(
  sources: Map<string, Uint8Array>,
  groups: PageItem[][],
  filenames: string[],
  zip: boolean,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Uint8Array> {
  if (!groups.length || groups.some(group => !group.length)) throw new Error('没有可导出的页面。');
  if (filenames.length !== groups.length || new Set(filenames).size !== filenames.length || (!zip && groups.length !== 1)) {
    throw new Error('导出文件名与页面分组不匹配。');
  }
  const uses = new Map<string, number>();
  for (const group of groups) for (const id of new Set(group.map(page => page.sourceId))) uses.set(id, (uses.get(id) ?? 0) + 1);
  const loaded = new Map<string, PDFDocument>();
  const archive = new JSZip();
  const total = groups.reduce((count, pages) => count + pages.length, 0);
  let done = 0;
  let single: Uint8Array | undefined;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const output = await PDFDocument.create();
    output.setProducer('页序 · 本地 PDF 工作台');
    const group = groups[groupIndex];
    const bySource = new Map<string, { page: PageItem; position: number }[]>();
    group.forEach((page, position) => {
      const entries = bySource.get(page.sourceId) ?? [];
      entries.push({ page, position });
      bySource.set(page.sourceId, entries);
    });
    const copies: ReturnType<PDFDocument['getPages']> = [];
    for (const [sourceId, entries] of bySource) {
      let source = loaded.get(sourceId);
      if (!source) {
        const bytes = sources.get(sourceId);
        if (!bytes) throw new Error('来源文件已不可用，请重新导入。');
        source = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
        loaded.set(sourceId, source);
      }
      if (entries.some(({ page }) => !Number.isInteger(page.pageIndex) || page.pageIndex < 0 || page.pageIndex >= source.getPageCount())) {
        throw new Error('原始页码已越界，无法导出。');
      }
      // One copier per source/group reuses shared fonts and image resources.
      const batch = await output.copyPages(source, entries.map(({ page }) => page.pageIndex));
      entries.forEach(({ position }, index) => { copies[position] = batch[index]; });
      const remaining = uses.get(sourceId)! - 1;
      uses.set(sourceId, remaining);
      if (!remaining) loaded.delete(sourceId);
    }
    for (let index = 0; index < group.length; index++) {
      const page = group[index];
      const copied = copies[index];
      copied.setRotation(degrees((copied.getRotation().angle + page.rotation) % 360));
      output.addPage(copied);
      done++;
      if (done % 10 === 0 || done === total) onProgress(done, total);
    }
    const bytes = await output.save();
    if (zip) archive.file(filenames[groupIndex], bytes);
    else single = bytes;
  }
  if (!zip) return single!;
  return archive.generateAsync({ type: 'uint8array', compression: 'STORE' });
}
