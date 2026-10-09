import { describe, expect, it } from 'vitest';
import { emptyHistory, historyReducer, movePages, parseRange, parseSplitRanges, safeFilename, type PageItem } from './model';

const pages: PageItem[] = ['a1', 'b1', 'a2', 'b2', 'a3'].map((id, index) => ({ id, sourceId: id[0], pageIndex: index, rotation: 0 }));

describe('current page ranges', () => {
  it('normalizes separated ranges, duplicates and Chinese separators into document order', () => {
    expect(parseRange('5,1-3，2、4', 5)).toEqual([0, 1, 2, 3, 4]);
  });
  it.each(['', '0', '6', '4-2', '1-', '1.5', '1,,2', '-1', '999999999999999999'])('rejects invalid selection %s', range => {
    expect(() => parseRange(range, 5)).toThrow();
  });
  it('allows gaps and reports excluded pages', () => {
    expect(parseSplitRanges(['1-2', '5'], 5)).toEqual({ ranges: [[0, 1], [4]], omitted: 2 });
  });
  it.each([['1-3', '3-4'], ['1,3'], [''], ['4-6'], ['3-1']])('rejects invalid split %j', (...rows) => {
    expect(() => parseSplitRanges(rows, 5)).toThrow();
  });
});

describe('stable group moves', () => {
  const ids = (items: PageItem[]) => items.map(page => page.id);
  it('gathers interleaved file pages in their current relative order', () => {
    expect(ids(movePages(pages, new Set(['a1', 'a2', 'a3']), 2))).toEqual(['b1', 'a1', 'a2', 'a3', 'b2']);
  });
  it('moves multiple pages to the final gap without reversing them', () => {
    expect(ids(movePages(pages, new Set(['a1', 'a2']), pages.length))).toEqual(['b1', 'b2', 'a3', 'a1', 'a2']);
  });
  it('accounts for removed pages before a destination', () => {
    expect(ids(movePages(pages, new Set(['b1', 'b2']), 4))).toEqual(['a1', 'a2', 'b1', 'b2', 'a3']);
  });
  it('preserves reference on a no-op move', () => {
    expect(movePages(pages, new Set(['a1']), 1)).toBe(pages);
  });
});

describe('history and names', () => {
  it('restores removals and rotations, and clears redo after a new edit', () => {
    const first = historyReducer(emptyHistory, { type: 'commit', update: () => ({ sources: [], pages }) });
    const changed = historyReducer(first, { type: 'commit', update: state => ({ ...state, pages: state.pages.slice(1).map(page => ({ ...page, rotation: 90 })) }) });
    const undone = historyReducer(changed, { type: 'undo' });
    expect(undone.present.pages).toEqual(pages);
    expect(historyReducer(undone, { type: 'redo' }).present).toEqual(changed.present);
    expect(historyReducer(undone, { type: 'commit', update: state => ({ ...state, pages: [] }) }).future).toEqual([]);
  });
  it('limits undo retention to 60 snapshots', () => {
    let history = emptyHistory;
    for (let i = 0; i < 90; i++) history = historyReducer(history, { type: 'commit', update: state => ({ ...state, pages: [...state.pages] }) });
    expect(history.past).toHaveLength(60);
  });
  it('sanitizes download names', () => {
    expect(safeFilename('a/b.pdf')).toBe('a_b');
    expect(safeFilename('  ')).toBe('整理后的文档');
  });
});
