import type { WordPage, WordPageInfo } from './word-protocol';
import type { OcrResult } from './ocr-protocol';
import type { TextLine } from './text-layout';
export type PageStatus = 'pending' | 'processing' | 'success' | 'empty' | 'failed';
export interface PageDraft {
  info: WordPageInfo; checkStatus: PageStatus; ocrStatus: PageStatus;
  native?: WordPage; recognized?: WordPage; reviewed: boolean; excluded: boolean; error?: string;
}
export type TextDrafts = Record<string, PageDraft>;
export const newDraft = (info: WordPageInfo): PageDraft => ({ info, checkStatus:'pending', ocrStatus:'pending', reviewed:false, excluded:false });
export function interruptedDrafts(input: TextDrafts): TextDrafts {
  return Object.fromEntries(Object.entries(input).map(([id, d]) => [id, { ...d,
    checkStatus: d.checkStatus === 'processing' ? 'pending' : d.checkStatus,
    ocrStatus: d.ocrStatus === 'processing' ? 'pending' : d.ocrStatus }]));
}
export interface RasterGeometry { width:number; height:number; transform:number[] }
export function inverse(m: number[]): number[] {
  const [a,b,c,d,e,f] = m, det = a*d-b*c;
  if (!det) throw new Error('页面坐标无效。');
  return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
}
export function point(m:number[], x:number,y:number):[number,number] { return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]; }
export function ocrPage(info:WordPageInfo, result:OcrResult, geometry:RasterGeometry): WordPage {
  const inv=inverse(geometry.transform), angle=-(result.rotateRadians??0), co=Math.cos(angle),si=Math.sin(angle);
  const w=result.imageWidth??geometry.width,h=result.imageHeight??geometry.height;
  // OCR deskew rotates the raster about its center. Map its coordinates back before applying the PDF viewport inverse.
  const map=(x:number,y:number)=> point(inv,co*(x-w/2)-si*(y-h/2)+geometry.width/2,si*(x-w/2)+co*(y-h/2)+geometry.height/2);
  const layout:TextLine[]=(result.lines??[]).filter(line=>line.text.trim()).map((line,index)=> {
    const {x0,y0,x1,y1}=line.bbox;
    const origin=map(x0,y1), right=map(x1,y1), top=map(x0,y0);
    const height=Math.hypot(top[0]-origin[0],top[1]-origin[1]);
    const width=Math.hypot(right[0]-origin[0],right[1]-origin[1]);
    return {id:`${info.id}:ocr:${index}`,text:line.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim(),x:origin[0],y:origin[1],width,height,
      matrix:[(right[0]-origin[0])/Math.max(width,1),(right[1]-origin[1])/Math.max(width,1),(top[0]-origin[0])/Math.max(height,1),(top[1]-origin[1])/Math.max(height,1),...origin],
      confidence:line.confidence,paragraph:line.paragraph,words:line.words.map(word=>({text:word.text,confidence:word.confidence,corners:[[word.bbox.x0,word.bbox.y0],[word.bbox.x1,word.bbox.y0],[word.bbox.x1,word.bbox.y1],[word.bbox.x0,word.bbox.y1]].map(([x,y])=>map(x,y))}))};
  });
  return {...info,lines:layout.map(l=>l.text),layout,ocr:{confidence:result.confidence}};
}
export function editablePage(draft:PageDraft):WordPage|undefined { return draft.recognized ?? draft.native; }
