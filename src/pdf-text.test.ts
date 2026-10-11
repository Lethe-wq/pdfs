import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFPageProxy, TextContent, TextItem } from 'pdfjs-dist/types/src/display/api';
import { readPageText } from './pdf-text';

type TextPage = Parameters<typeof readPageText>[0];
const item = (str: string): TextItem => ({ str, dir: 'ltr', transform: [12, 0, 0, 12, 20, 100], width: 50, height: 12, hasEOL: true, fontName: 'f1' });
const chunk = (str: string): TextContent => ({ items: [{ type: 'beginMarkedContent', id: 'm1' }, item(str)], styles: {}, lang: null });
const pageFor = (stream: ReadableStream<TextContent>): TextPage => ({ isPureXfa: false, streamTextContent: () => stream, getTextContent: vi.fn() } as unknown as TextPage);

describe('PDF text stream compatibility', () => {
  it('reads all chunks without requiring an async iterator and ignores marked content', async () => {
    const stream = new ReadableStream<TextContent>({ start(controller) { controller.enqueue(chunk('中文 123')); controller.enqueue(chunk('English!')); controller.close(); } });
    Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined });
    const page = pageFor(stream);
    expect((await readPageText(page)).map(item => item.str)).toEqual(['中文 123', 'English!']);
    expect(page.getTextContent).not.toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });

  it('cancels a pending read, releases its lock and leaves other reads usable', async () => {
    const cancel = vi.fn(); const stream = new ReadableStream<TextContent>({ cancel });
    const controller = new AbortController();
    const pending = readPageText(pageFor(stream), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TaskCancelledError' });
    controller.abort(); await rejected;
    expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
    const next = new ReadableStream<TextContent>({ start(c) { c.enqueue(chunk('next')); c.close(); } });
    expect((await readPageText(pageFor(next)))[0].str).toBe('next');
  });

  it('propagates stream failure and releases the reader rather than returning partial text', async () => {
    const stream = new ReadableStream<TextContent>({ start(c) { c.error(new Error('bad text stream')); } });
    await expect(readPageText(pageFor(stream))).rejects.toThrow('bad text stream');
    expect(stream.locked).toBe(false);
  });

  it('times out a stalled stream and cancels the reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(); const stream = new ReadableStream<TextContent>({ cancel });
    try {
      const pending = readPageText(pageFor(stream));
      const rejected = expect(pending).rejects.toThrow('超时');
      await vi.advanceTimersByTimeAsync(120_001); await rejected;
      expect(cancel).toHaveBeenCalledOnce(); expect(stream.locked).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('keeps the separate XFA text path', async () => {
    const streamTextContent = vi.fn();
    const page = { isPureXfa: true, streamTextContent, getTextContent: vi.fn().mockResolvedValue(chunk('XFA text')) } as unknown as TextPage;
    expect((await readPageText(page))[0].str).toBe('XFA text'); expect(streamTextContent).not.toHaveBeenCalled();
  });

  it('reproduces the upstream failure on a real PDF and extracts editable text without the missing Safari API', async () => {
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('Editable text 123!', { x: 30, y: 600, size: 12, font });
    const document = await getDocument({ data: await pdf.save(), useSystemFonts: true }).promise;
    const descriptor = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
    Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: undefined, configurable: true });
    try {
      const page: PDFPageProxy = await document.getPage(1);
      await expect(page.getTextContent()).rejects.toBeInstanceOf(TypeError);
      expect((await readPageText(page)).map(item => item.str)).toEqual(['Editable text 123!']);
    } finally {
      if (descriptor) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, descriptor);
      else Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator);
      await document.destroy();
    }
  });
});
