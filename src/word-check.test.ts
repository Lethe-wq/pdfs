import { describe, expect, it, vi } from 'vitest';
import { collectWordPages } from './word-check';
const pages = [1, 3, 6].map(n => ({ id: `p${n}`, sourceId: 'a', sourceName: 'A.pdf', pageIndex: n - 1, currentPage: n }));
describe('Word page inspection', () => {
  it('reads the frozen selected sequence and reports progress', async () => {
    const progress = vi.fn(); const read = vi.fn(async () => []);
    expect((await collectWordPages(pages, read, undefined, progress)).map(p => p.currentPage)).toEqual([1, 3, 6]);
    expect(read).toHaveBeenCalledTimes(3); expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
  it('cancels a stalled page immediately and does not schedule later pages', async () => {
    const controller = new AbortController(); const read = vi.fn(() => new Promise<[]>(() => {}));
    const pending = collectWordPages(pages, read, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'TaskCancelledError' }); controller.abort(); await rejected;
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('reports the failing current/source page and returns no partial analysis', async () => {
    const read = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Bad text'));
    await expect(collectWordPages(pages, read)).rejects.toThrow('第 3 页（A.pdf，原第 3 页）'); expect(read).toHaveBeenCalledTimes(2);
  });
});
