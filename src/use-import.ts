import { useCallback } from 'react';
import { pdfClient } from './pdf-client';
import { registerPreview } from './preview';
import { importBatch } from './import-batch';
import type { Snapshot } from './model';
import type { Task } from './use-task';

export interface Notice { kind: 'success' | 'error' | 'info'; text: string; retry?: boolean }
export function useImport(task: Task, initialCount: number, commit: (update: (snapshot: Snapshot) => Snapshot) => void, notify: (notice: Notice | null) => void) {
  const { begin, update, finish } = task;
  return useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;
    const controller = begin('正在读取文件…');
    if (!controller) return;
    notify(null);
    try {
      const result = await importBatch(files, {
        signal: controller.signal, initialCount,
        read: (id, file) => pdfClient.import(id, file, {
          signal: controller.signal,
          onRecovery: () => update(controller, '正在恢复文件处理…'),
        }),
        preview: (id, bytes) => registerPreview(id, bytes, controller.signal),
        progress: (index, total, name) => update(controller, `正在读取 ${index + 1}/${total}：${name}`, Math.round(index / total * 100)),
      });
      if (result.sources.length) commit(snapshot => ({ sources: [...snapshot.sources, ...result.sources], pages: [...snapshot.pages, ...result.pages] }));
      const summary = `已添加 ${result.sources.length} 个 PDF，共 ${result.pages.length} 页。`;
      notify({
        kind: result.errors.length ? 'error' : result.cancelled ? 'info' : 'success',
        text: `${result.cancelled ? '已取消剩余文件的读取。' : ''}${summary}${result.errors.length ? `\n以下文件未添加：\n${result.errors.join('\n')}` : ''}${result.unavailable ? '\n处理未能恢复，剩余文件尚未读取。已有整理结果仍保留。' : ''}`,
        retry: result.unavailable,
      });
    } catch (error) { notify({ kind: 'error', text: `读取失败：${(error as Error).message}。已有整理结果仍保留。` }); }
    finally { finish(controller); }
  }, [initialCount, commit, notify, begin, update, finish]);
}
