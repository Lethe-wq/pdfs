import type { WordInputPage, WordPageInfo, WordTextItem } from './word-protocol';
import { checkCancelled, TaskCancelledError, waitFor } from './task-errors';

export async function collectWordPages(
  pages: WordPageInfo[], read: (page: WordPageInfo) => Promise<WordTextItem[]>,
  signal?: AbortSignal, progress: (done: number, total: number) => void = () => {},
): Promise<WordInputPage[]> {
  if (!pages.length) throw new Error('没有可转换的页面。');
  const result: WordInputPage[] = [];
  for (const page of pages) {
    checkCancelled(signal);
    try {
      const items = await waitFor(read(page), signal);
      checkCancelled(signal); result.push({ ...page, items }); progress(result.length, pages.length);
    } catch (error) {
      if (error instanceof TaskCancelledError) throw error;
      throw new Error(`第 ${page.currentPage} 页（${page.sourceName}，原第 ${page.pageIndex + 1} 页）检查失败：${(error as Error).message}`);
    }
  }
  return result;
}
