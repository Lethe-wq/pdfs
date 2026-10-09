import { describe, expect, it } from 'vitest';
import { emptyHistory, exportContentKey, hasUnexportedChanges, historyReducer, type Snapshot } from './model';
const snapshot: Snapshot = {
  sources: [{ id: 'a', name: 'a.pdf', pageCount: 2, size: 10, color: 0 }],
  pages: [{ id: 'p1', sourceId: 'a', pageIndex: 0, rotation: 0 }, { id: 'p2', sourceId: 'a', pageIndex: 1, rotation: 0 }],
};
describe('generated output baseline', () => {
  it('recognizes undo back to the generated content and redo away from it', () => {
    const initial = historyReducer(emptyHistory, { type: 'commit', update: () => snapshot });
    const key = exportContentKey(initial.present.pages);
    const changed = historyReducer(initial, { type: 'commit', update: current => ({ ...current, pages: current.pages.map(page => ({ ...page, rotation: 90 })) }) });
    expect(hasUnexportedChanges(changed, key)).toBe(true);
    const undone = historyReducer(changed, { type: 'undo' });
    expect(undone.revision).not.toBe(initial.revision);
    expect(hasUnexportedChanges(undone, key)).toBe(false);
    expect(hasUnexportedChanges(historyReducer(undone, { type: 'redo' }), key)).toBe(true);
  });
  it('matches content after four rotations without depending on snapshot identity', () => {
    expect(exportContentKey(snapshot.pages.map(page => ({ ...page, id: 'new-id', rotation: 360 })))).toBe(exportContentKey(snapshot.pages));
  });
  it('detects reorder, delete, source and original index changes', () => {
    const key = exportContentKey(snapshot.pages);
    for (const pages of [snapshot.pages.slice().reverse(), snapshot.pages.slice(1), snapshot.pages.map(page => ({ ...page, sourceId: 'b' })), snapshot.pages.map(page => ({ ...page, pageIndex: 1 }))]) expect(exportContentKey(pages)).not.toBe(key);
  });
  it('keeps never-exported work dirty after deleting all pages or undoing import', () => {
    expect(hasUnexportedChanges(emptyHistory, null)).toBe(false);
    const imported = historyReducer(emptyHistory, { type: 'commit', update: () => snapshot });
    expect(hasUnexportedChanges(imported, null)).toBe(true);
    expect(hasUnexportedChanges(historyReducer(imported, { type: 'commit', update: current => ({ ...current, pages: [] }) }), null)).toBe(true);
    expect(hasUnexportedChanges(historyReducer(imported, { type: 'undo' }), null)).toBe(true);
  });
});
