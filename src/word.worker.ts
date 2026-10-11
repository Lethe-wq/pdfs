/// <reference lib="webworker" />
import { analyzeWordPages } from './word-text';
import { generateWord } from './word-engine';
import type { WordRequest, WordResponse } from './word-protocol';

const reply = (response: WordResponse, transfer: Transferable[] = []) => self.postMessage(response, transfer);
self.onmessage = async ({ data }: MessageEvent<WordRequest>) => {
  const { id, kind } = data;
  const progress = (done: number, total: number) => reply({ type: 'progress', id, done, total });
  try {
    if (kind === 'analyze') reply({ type: 'result', id, kind, result: analyzeWordPages(data.pages, progress) });
    else {
      const result = await generateWord(data.pages, progress);
      reply({ type: 'result', id, kind, result }, [result]);
    }
  } catch (error) { reply({ type: 'error', id, message: error instanceof Error ? error.message : 'Word 转换失败，请重试。' }); }
};
