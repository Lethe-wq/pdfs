import { useState } from 'react';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { PageItem, SourceFile } from './model';

export function usePageDrag(pages: PageItem[], selected: Set<string>, sources: Map<string, SourceFile>, move: (ids: Set<string>, destination: number) => void) {
  const [drag, setDrag] = useState<{ ids: Set<string>; label: string } | null>(null);
  const [insertion, setInsertion] = useState<number | null>(null);
  function dragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    const ids = data?.kind === 'file'
      ? new Set(pages.filter(page => page.sourceId === data.sourceId).map(page => page.id))
      : selected.has(data?.pageId) ? new Set(selected) : new Set<string>([data?.pageId]);
    setDrag({ ids, label: data?.kind === 'file' ? sources.get(data.sourceId)!.name : `移动 ${ids.size} 页` });
  }
  function destination(event: DragOverEvent | DragEndEvent): number | null {
    if (!event.over) return null;
    const index = event.over.data.current?.index as number | undefined;
    if (index === undefined || event.over.id === 'end-zone') return index ?? null;
    const activation = event.activatorEvent as PointerEvent;
    const x = activation.clientX + event.delta.x;
    return index + (x > event.over.rect.left + event.over.rect.width / 2 ? 1 : 0);
  }
  function dragEnd(event: DragEndEvent) {
    const index = destination(event);
    if (drag && index !== null) move(drag.ids, index);
    setDrag(null); setInsertion(null);
  }
  return { drag, insertion, setDrag, setInsertion, dragStart, dragEnd, destination };
}
