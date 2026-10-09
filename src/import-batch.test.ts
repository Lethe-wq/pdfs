import { describe, expect, it, vi } from 'vitest';
import { importBatch } from './import-batch';
import { TaskCancelledError } from './task-errors';
const files = ['a.pdf', 'b.pdf', 'c.pdf'].map(name => new File(['pdf'], name));
const result = { pageCount: 2, bytes: new ArrayBuffer(1) };
describe('batch import cancellation', () => {
  it('keeps completed files and stops remaining files', async () => {
    const controller = new AbortController();
    const read = vi.fn(async (_: string, file: File) => {
      if (file.name === 'b.pdf') { controller.abort(); throw new TaskCancelledError(); }
      return result;
    });
    const batch = await importBatch(files, { signal: controller.signal, initialCount: 1, read, preview: async () => {}, progress: () => {} });
    expect(batch.sources.map(source => source.name)).toEqual(['a.pdf']);
    expect(batch.pages).toHaveLength(2);
    expect(batch.sources[0].color).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(batch.cancelled).toBe(true);
    expect(batch.errors).toEqual([]);
  });
  it('does not commit a file cancelled during preview', async () => {
    const controller = new AbortController();
    const batch = await importBatch(files, { signal: controller.signal, initialCount: 0, read: async () => result, preview: async () => controller.abort(), progress: () => {} });
    expect(batch.sources).toEqual([]);
    expect(batch.pages).toEqual([]);
    expect(batch.cancelled).toBe(true);
  });
  it('continues past a bad PDF and keeps valid files in order', async () => {
    const batch = await importBatch(files, { signal: new AbortController().signal, initialCount: 0,
      read: async (_, file) => { if (file.name === 'b.pdf') throw new Error('文件已损坏'); return result; },
      preview: async () => {}, progress: () => {},
    });
    expect(batch.sources.map(source => source.name)).toEqual(['a.pdf', 'c.pdf']);
    expect(batch.errors).toEqual(['b.pdf：文件已损坏']);
    expect(batch.pages.map(page => page.pageIndex)).toEqual([0, 1, 0, 1]);
  });
});
