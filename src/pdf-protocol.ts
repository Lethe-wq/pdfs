import type { TextLine } from './text-layout';
import type { PageItem } from './model';

export interface Operations {
  searchable: {input:{pages:PageItem[];layers:Record<string,TextLine[]>;fontUrl:string};output:ArrayBuffer};
  import: { input: { sourceId: string; bytes: ArrayBuffer }; output: { pageCount: number; bytes: ArrayBuffer } };
  restore: { input: { sourceId: string; bytes: ArrayBuffer }; output: null };
  release: { input: { sourceIds: string[] }; output: null };
  export: { input: { groups: PageItem[][]; filenames: string[]; zip: boolean }; output: ArrayBuffer };
}
export type Operation = keyof Operations;
export type Request<K extends Operation = Operation> = {
  [P in K]: { id: number; kind: P } & Operations[P]['input']
}[K];
export type Response =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'error'; id: number; message: string }
  | { [K in Operation]: { type: 'result'; id: number; kind: K; result: Operations[K]['output'] } }[Operation];

export function transferableBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
  return bytes.slice().buffer as ArrayBuffer;
}
