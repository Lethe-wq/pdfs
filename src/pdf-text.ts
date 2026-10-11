import type { PDFPageProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { WordTextItem } from './word-protocol';
import { checkCancelled, waitFor } from './task-errors.ts';

type TextPage = Pick<PDFPageProxy, 'isPureXfa' | 'getTextContent' | 'streamTextContent'>;
const textItems = (content: TextContent): WordTextItem[] => content.items
  .filter((item): item is TextItem => 'str' in item)
  .map(({ str, dir, transform, width, height, hasEOL }) => ({ str, dir, transform, width, height, hasEOL }));

export async function readPageText(page: TextPage, signal?: AbortSignal): Promise<WordTextItem[]> {
  checkCancelled(signal);
  // XFA has a separate HTML text path and does not iterate a ReadableStream.
  if (page.isPureXfa) return textItems(await waitFor(page.getTextContent(), signal));
  // Safari exposes getReader(), but not ReadableStream's async iterator used by PDF.js getTextContent().
  const reader = page.streamTextContent().getReader();
  const items: WordTextItem[] = [];
  let complete = false;
  try {
    for (;;) {
      checkCancelled(signal);
      const { done, value } = await waitFor(reader.read(), signal);
      if (done) { complete = true; return items; }
      for (const item of textItems(value)) items.push(item);
    }
  } finally {
    // Cancel only this text stream, keeping the shared PDF document and preview usable.
    if (!complete) void reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch { /* Cleanup must not replace the original read/cancel error. */ }
  }
}
