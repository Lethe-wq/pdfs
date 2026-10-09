import { memo, useEffect, useRef, type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDownToLine, ArrowUpToLine, Check, FileText, GripVertical, Maximize2, Plus, X } from 'lucide-react';
import type { PageItem, SourceFile } from './model';
import { fileSize } from './model';
import PdfCanvas from './PdfCanvas';

export function Modal({ title, subtitle, onClose, children, wide = false, busy = false }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current!;
    const focusable = () => [...box.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(element => element.offsetParent !== null);
    (focusable()[0] ?? box).focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) close.current();
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0]; const last = items.at(-1);
      if (!first) { event.preventDefault(); box.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last!.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [busy]);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose} disabled={busy}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

export const SourceRow = memo(function SourceRow({ source, retained, busy, move, remove }: {
  source: SourceFile; retained: number; busy: boolean; move: (id: string, end: boolean) => void; remove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${source.id}`, data: { kind: 'file', sourceId: source.id }, disabled: busy || !retained,
  });
  return <div className={`source-row tint-${source.color % 5} ${isDragging ? 'dragging' : ''}`} ref={setNodeRef}>
    <div className="source-top"><span className="file-badge"><FileText size={20} /></span>
      <button className="drag-handle" {...attributes} {...listeners} disabled={busy || !retained} aria-label={`拖动整份文件 ${source.name}`} title="拖到页面区，移动该文件全部保留页面"><GripVertical size={17} /></button>
    </div>
    <strong title={source.name}>{source.name}</strong>
    <div className="source-meta">保留 {retained} / {source.pageCount} 页<span>{fileSize(source.size)}</span></div>
    <div className="source-actions">
      <button onClick={() => move(source.id, false)} disabled={busy || !retained} title="将此文件保留页面移至开头" aria-label={`${source.name} 移至开头`}><ArrowUpToLine size={14} />开头</button>
      <button onClick={() => move(source.id, true)} disabled={busy || !retained} title="将此文件保留页面移至末尾" aria-label={`${source.name} 移至末尾`}><ArrowDownToLine size={14} />末尾</button>
      <button onClick={() => remove(source.id)} disabled={busy} className="remove-file" title="移除此文件，可撤销" aria-label={`移除 ${source.name}`}><X size={15} /></button>
    </div>
  </div>;
});

export const PageCard = memo(function PageCard({ page, source, index, selected, busy, insertBefore, insertAfter, select, preview, move }: {
  page: PageItem; source: SourceFile; index: number; selected: boolean; busy: boolean;
  insertBefore: boolean; insertAfter: boolean; select: (id: string, shift: boolean) => void; preview: (id: string) => void; move: (id: string, end: boolean) => void;
}) {
  const draggable = useDraggable({ id: `page-${page.id}`, data: { kind: 'page', pageId: page.id }, disabled: busy });
  const droppable = useDroppable({ id: `gap-${page.id}`, data: { index }, disabled: busy });
  return <div className={`page-cell ${insertBefore ? 'insert-before' : ''} ${insertAfter ? 'insert-after' : ''}`} ref={droppable.setNodeRef}>
    <article className={`page-card tint-${source.color % 5} ${selected ? 'selected' : ''} ${draggable.isDragging ? 'dragging' : ''}`} ref={draggable.setNodeRef} data-page-id={page.id}>
      <div className="page-card-top">
        <label className="page-checkbox" title={`选择第 ${index + 1} 页`}>
          <input type="checkbox" checked={selected} disabled={busy} aria-label={`选择第 ${index + 1} 页`} onChange={event => select(page.id, (event.nativeEvent as MouseEvent).shiftKey)} />
          <span>{selected && <Check size={13} strokeWidth={3} />}</span>
        </label>
        <span className="page-number">{String(index + 1).padStart(2, '0')}</span>
        <button className="drag-handle" {...draggable.attributes} {...draggable.listeners} disabled={busy} aria-label={`拖动第 ${index + 1} 页`}><GripVertical size={17} /></button>
      </div>
      <button className="page-preview" onClick={() => preview(page.id)} aria-label={`预览第 ${index + 1} 页`} disabled={busy}>
        <PdfCanvas page={page} /><span className="preview-hint"><Maximize2 size={14} />放大预览</span>
      </button>
      <div className="page-card-bottom"><div className="page-source"><i /><span title={source.name}>{source.name}</span></div>
        <div className="page-detail"><span>原第 {page.pageIndex + 1} 页{page.rotation ? ` · 已旋转 ${page.rotation}°` : ''}</span>
          <div className="page-move"><button disabled={busy} onClick={() => move(page.id, false)} aria-label={`第 ${index + 1} 页移至开头`} title="移至开头"><ArrowUpToLine size={13} /></button><button disabled={busy} onClick={() => move(page.id, true)} aria-label={`第 ${index + 1} 页移至末尾`} title="移至末尾"><ArrowDownToLine size={13} /></button></div>
        </div>
      </div>
    </article>
  </div>;
});

export function EndZone({ index, active, insertion, busy, add }: { index: number; active: boolean; insertion: number | null; busy: boolean; add: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'end-zone', data: { index }, disabled: busy });
  return <div ref={setNodeRef} className={`end-zone ${active ? 'drop-zone' : ''} ${isOver || insertion === index ? 'over' : ''}`}>
    {active ? <><ArrowDownToLine size={25} /><span>放到最后</span></> : <button onClick={add} disabled={busy}><Plus size={27} /><span>继续添加 PDF</span></button>}
  </div>;
}
