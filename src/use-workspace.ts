import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { emptyHistory, exportContentKey, hasUnexportedChanges, historyReducer, movePages, type PageItem, type Snapshot } from './model';
import { releasePreviews } from './preview';
import { pdfClient } from './pdf-client';

export function useWorkspace(busy: string) {
  const [history, dispatch] = useReducer(historyReducer, emptyHistory);
  const { sources, pages } = history.present;
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const dirty = useMemo(() => hasUnexportedChanges(history, generatedKey), [history, generatedKey]);
  const sourcesById = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const page of pages) counts.set(page.sourceId, (counts.get(page.sourceId) ?? 0) + 1);
    return counts;
  }, [pages]);
  const totalSize = useMemo(() => sources.reduce((sum, source) => sum + source.size, 0), [sources]);
  const commit = useCallback((update: (snapshot: Snapshot) => Snapshot) => dispatch({ type: 'commit', update }), []);
  const move = useCallback((ids: Set<string>, destination: number) => {
    commit(snapshot => {
      const result = movePages(snapshot.pages, ids, destination);
      return result === snapshot.pages ? snapshot : { ...snapshot, pages: result };
    });
  }, [commit]);
  const moveSource = useCallback((id: string, end: boolean) => {
    commit(snapshot => {
      const ids = new Set(snapshot.pages.filter(page => page.sourceId === id).map(page => page.id));
      const result = movePages(snapshot.pages, ids, end ? snapshot.pages.length : 0);
      return result === snapshot.pages ? snapshot : { ...snapshot, pages: result };
    });
  }, [commit]);
  const removeSource = useCallback((id: string) => commit(snapshot => ({
    sources: snapshot.sources.filter(source => source.id !== id), pages: snapshot.pages.filter(page => page.sourceId !== id),
  })), [commit]);
  const markGenerated = useCallback((exportedPages: PageItem[]) => setGeneratedKey(exportContentKey(exportedPages)), []);
  useEffect(() => {
    if (busy) return;
    const retained = new Set([...history.past, history.present, ...history.future].flatMap(snapshot => snapshot.sources.map(source => source.id)));
    releasePreviews(retained);
    pdfClient.releaseUnused(retained);
  }, [history, busy]);
  return { history, dispatch, sources, pages, dirty, commit, move, moveSource, removeSource, markGenerated, sourcesById, sourceCounts, totalSize };
}
