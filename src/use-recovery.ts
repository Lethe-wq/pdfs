import { useCallback } from 'react';
import { pdfClient } from './pdf-client';
import { TaskCancelledError } from './task-errors';
import type { Notice } from './use-import';
import type { Task } from './use-task';

export function useRecovery(task: Task, notify: (notice: Notice | null) => void) {
  const { begin, update, finish } = task;
  return useCallback(async () => {
    const controller = begin('正在恢复文件处理…');
    if (!controller) return;
    notify(null);
    try {
      await pdfClient.recover({ signal: controller.signal, onRecovery: () => update(controller, '正在重新读取来源文件…') });
      notify({ kind: 'success', text: '文件处理已恢复，可以继续整理和导出。' });
    } catch (error) {
      notify(error instanceof TaskCancelledError
        ? { kind: 'info', text: '已取消恢复，整理结果仍保留。', retry: true }
        : { kind: 'error', text: `恢复失败：${(error as Error).message}。可以再次重试。`, retry: true });
    } finally { finish(controller); }
  }, [begin, update, finish, notify]);
}
