import type { TextLine } from './text-layout';
export interface WordPageInfo { id: string; sourceId: string; sourceName: string; pageIndex: number; currentPage: number }
export interface WordTextItem { str: string; dir: string; transform: number[]; width: number; height: number; hasEOL: boolean }
export interface WordInputPage extends WordPageInfo { items: WordTextItem[] }
export interface WordPage extends WordPageInfo { lines: string[]; layout?: TextLine[]; originalLines?: boolean; ocr?: { confidence: number } }
export interface WordAnalysis { pages: WordPage[]; skipped: WordPageInfo[]; total: number; ocrAttempted?: boolean }
export interface WordOperations {
  analyze: { input: { pages: WordInputPage[] }; output: WordAnalysis };
  generate: { input: { pages: WordPage[] }; output: ArrayBuffer };
}
export type WordOperation = keyof WordOperations;
export type WordRequest = { [K in WordOperation]: { id: number; kind: K } & WordOperations[K]['input'] }[WordOperation];
export type WordResponse =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'error'; id: number; message: string }
  | { [K in WordOperation]: { type: 'result'; id: number; kind: K; result: WordOperations[K]['output'] } }[WordOperation];
