export interface SourceFile {
  id: string;
  name: string;
  pageCount: number;
  size: number;
  color: number;
}

export interface PageItem {
  id: string;
  sourceId: string;
  pageIndex: number;
  rotation: number;
}

export interface Snapshot {
  sources: SourceFile[];
  pages: PageItem[];
}

export interface History {
  past: Snapshot[];
  present: Snapshot;
  future: Snapshot[];
  revision: number;
}

export const emptyHistory: History = {
  past: [], present: { sources: [], pages: [] }, future: [], revision: 0,
};

// Only page content/order affects a complete export; metadata and selection do not.
export function exportContentKey(pages: PageItem[]): string {
  return JSON.stringify(pages.map(page => [page.sourceId, page.pageIndex, ((page.rotation % 360) + 360) % 360]));
}

export function hasUnexportedChanges(history: History, generatedKey: string | null): boolean {
  if (generatedKey !== null) return exportContentKey(history.present.pages) !== generatedKey;
  return [...history.past, history.present, ...history.future].some(snapshot => snapshot.sources.length > 0);
}

export type HistoryAction =
  | { type: 'commit'; update: (snapshot: Snapshot) => Snapshot }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace'; snapshot:Snapshot };


export function historyReducer(history: History, action: HistoryAction): History {
  if(action.type==='replace')return {...emptyHistory,present:action.snapshot,revision:history.revision+1};
  if (action.type === 'undo') {
    if (!history.past.length) return history;
    return {
      past: history.past.slice(0, -1), present: history.past.at(-1)!,
      future: [history.present, ...history.future], revision: history.revision + 1,
    };
  }
  if (action.type === 'redo') {
    if (!history.future.length) return history;
    return {
      past: [...history.past, history.present].slice(-60), present: history.future[0],
      future: history.future.slice(1), revision: history.revision + 1,
    };
  }
  const next = action.update(history.present);
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-60), present: next,
    future: [], revision: history.revision + 1,
  };
}

// Destination is a gap in the original list, before removing moving pages.
export function movePages(pages: PageItem[], ids: Set<string>, destination: number): PageItem[] {
  const moving = pages.filter(page => ids.has(page.id));
  if (!moving.length) return pages;
  const remaining = pages.filter(page => !ids.has(page.id));
  const insertion = pages.slice(0, destination).filter(page => !ids.has(page.id)).length;
  const result = [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)];
  return result.every((page, index) => page === pages[index]) ? pages : result;
}

export function parseRange(input: string, pageCount: number, continuous = false): number[] {
  const normalized = input.trim().replace(/[，、]/g, ',');
  if (!normalized) throw new Error('请填写页码范围。');
  const parts = normalized.split(',');
  if (continuous && parts.length !== 1) throw new Error('每行只能填写一个连续范围或单页。');
  const result = new Set<number>();
  for (const part of parts) {
    const match = part.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!match) throw new Error('格式不正确，请使用 1-3,5,8-10 这样的页码范围。');
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end > pageCount || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new Error(`页码必须在 1–${pageCount} 之间。`);
    }
    if (start > end) throw new Error('起始页不能大于结束页。');
    for (let page = start; page <= end; page++) result.add(page - 1);
  }
  return [...result].sort((a, b) => a - b);
}

export function parseSplitRanges(rows: string[], pageCount: number): { ranges: number[][]; omitted: number } {
  if (!rows.length) throw new Error('请至少填写一个范围。');
  const covered = new Set<number>();
  const ranges = rows.map((row, index) => {
    let range: number[];
    try { range = parseRange(row, pageCount, true); }
    catch (error) { throw new Error(`第 ${index + 1} 段：${(error as Error).message}`); }
    for (const page of range) {
      if (covered.has(page)) throw new Error(`第 ${index + 1} 段与其他范围重叠（第 ${page + 1} 页）。`);
      covered.add(page);
    }
    return range;
  });
  return { ranges, omitted: pageCount - covered.size };
}

export function safeFilename(input: string): string {
  return input.trim().replace(/\.(pdf|zip)$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).trim() || '整理后的文档';
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
