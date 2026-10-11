export interface OcrAssets { workerPath: string; corePath: string; langPath: string }
export interface OcrBox { x0: number; y0: number; x1: number; y1: number }
export interface OcrLine { text: string; confidence: number; bbox: OcrBox; paragraph: number; words: {text:string;confidence:number;bbox:OcrBox}[] }
export interface OcrResult { text: string; confidence: number; lines?: OcrLine[]; rotateRadians?: number; imageWidth?: number; imageHeight?: number }
export interface OcrRequest { id: number; image: ArrayBuffer; assets: OcrAssets }
export type OcrResponse = { id: number; type: 'progress'; progress: number; status: string }
  | { id: number; type: 'result'; result: OcrResult }
  | { id: number; type: 'error'; message: string };
