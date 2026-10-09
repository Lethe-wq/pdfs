import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseRange, type PageItem } from './model';

export function useSelection(pages: PageItem[]) {
  const [selected, setSelected] = useState(new Set<string>());
  const [range, setRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const anchor = useRef<string | null>(null);
  const selectedPages = useMemo(() => pages.filter(page => selected.has(page.id)), [pages, selected]);
  useEffect(() => {
    const valid = new Set(pages.map(page => page.id));
    setSelected(current => {
      const next = new Set([...current].filter(id => valid.has(id)));
      return next.size === current.size ? current : next;
    });
    setRangeError('');
  }, [pages]);
  const selectPage = useCallback((id: string, shift: boolean) => {
    const end = pages.findIndex(page => page.id === id);
    const start = pages.findIndex(page => page.id === anchor.current);
    if (end < 0) return;
    setSelected(current => {
      const next = new Set(current);
      if (shift && start >= 0) pages.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(page => next.add(page.id));
      else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!shift || start < 0) anchor.current = id;
  }, [pages]);
  const selectRange = useCallback(() => {
    try {
      setSelected(new Set(parseRange(range, pages.length).map(index => pages[index].id)));
      setRangeError(''); anchor.current = null;
    } catch (error) { setRangeError((error as Error).message); }
  }, [range, pages]);
  return { selected, setSelected, selectedPages, range, setRange, rangeError, setRangeError, selectPage, selectRange };
}
