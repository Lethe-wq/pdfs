import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseSplitRanges, safeFilename, type PageItem } from './model';
import { pdfClient } from './pdf-client';
import { checkCancelled, TaskCancelledError, WorkerFailure } from './task-errors';
import type { Notice } from './use-import';
import type { Task } from './use-task';

type ExportMode = 'all' | 'selection' | 'split';
export function useExport(task: Task, pages: PageItem[], selectedPages: PageItem[], markGenerated: (pages: PageItem[]) => void, notify: (notice: Notice | null) => void) {
  const [exportMode, setExportMode] = useState<ExportMode | null>(null);
  const [outputName, setOutputName] = useState('整理后的文档');
  const [splitRows, setSplitRows] = useState(['']);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const lastDownload = useRef<string | null>(null);
  const { begin, update, finish } = task;
  useEffect(() => () => { if (lastDownload.current) URL.revokeObjectURL(lastDownload.current); }, []);
  const { splitResult, splitError } = useMemo(() => {
    if (exportMode !== 'split') return { splitResult: null, splitError: '' };
    try { return { splitResult: parseSplitRanges(splitRows, pages.length), splitError: '' }; }
    catch (error) { return { splitResult: null, splitError: (error as Error).message }; }
  }, [exportMode, splitRows, pages.length]);
  const openExport = useCallback((mode: ExportMode) => {
    notify(null);
    setExportMode(mode);
    if (mode === 'split') setSplitRows(['']);
  }, [notify]);
  const exportPdf = useCallback(async () => {
    if (!exportMode || !pages.length || !outputName.trim() || (exportMode === 'selection' && !selectedPages.length) || (exportMode === 'split' && !splitResult)) return;
    const mode = exportMode;
    const base = safeFilename(outputName);
    const groups = mode === 'split' ? splitResult!.ranges.map(indices => indices.map(index => pages[index])) : [mode === 'all' ? pages : selectedPages];
    const filenames = mode === 'split' ? groups.map((_, index) => `${base}_${String(index + 1).padStart(2, '0')}_${splitRows[index].trim().replace(/\s/g, '')}.pdf`) : [`${base}.pdf`];
    const controller = begin('正在生成文件…');
    if (!controller) return;
    notify(null);
    try {
      const buffer = await pdfClient.export(groups, filenames, mode === 'split', {
        signal: controller.signal,
        onRecovery: () => update(controller, '正在恢复文件处理…'),
        progress: (done, total) => update(controller, `正在生成文件：${done} / ${total} 页`, Math.round(done / total * 100)),
      });
      checkCancelled(controller.signal);
      const blob = new Blob([buffer], { type: mode === 'split' ? 'application/zip' : 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (lastDownload.current) URL.revokeObjectURL(lastDownload.current);
      lastDownload.current = url;
      const name = mode === 'split' ? `${base}.zip` : `${base}.pdf`;
      setDownload({ url, name });
      if (mode === 'all') markGenerated(pages);
      // Generation is complete. Browser download completion has no reliable callback.
      const link = document.createElement('a'); link.href = url; link.download = name;
      try { document.body.appendChild(link); link.click(); }
      catch { /* The persistent download link remains available. */ }
      finally { link.remove(); }
      setExportMode(null);
      notify({ kind: 'success', text: mode === 'split'
        ? `已生成 ${groups.length} 个 PDF 并打包为 ZIP，可下载。如未自动下载，请点击下面的链接。`
        : `已生成 ${groups[0].length} 页的 PDF，可下载。如未自动下载，请点击下面的链接。` });
    } catch (error) {
      notify(error instanceof TaskCancelledError
        ? { kind: 'info', text: '已取消本次导出，整理结果和上次生成的文件仍保留。' }
        : { kind: 'error', text: `导出失败：${(error as Error).message}。整理结果仍保留，可以重试。`, retry: error instanceof WorkerFailure });
    } finally { finish(controller); }
  }, [exportMode, outputName, pages, selectedPages, splitRows, splitResult, begin, update, finish, notify, markGenerated]);
  return { exportMode, setExportMode, outputName, setOutputName, splitRows, setSplitRows, splitResult, splitError, openExport, exportPdf, download };
}
