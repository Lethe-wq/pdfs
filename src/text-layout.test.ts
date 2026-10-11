import { describe,it,expect } from 'vitest';
import JSZip from 'jszip';
import { paragraphs } from './text-layout';
import { ocrPage,point } from './text-drafts';
import { generateWord } from './word-engine';
const line=(text:string,y:number,extra={})=>({id:text,text,x:20,y,width:200,height:11,...extra});
describe('paragraph and coordinate models',()=> {
 it('joins wrapped Chinese and English while preserving hyphens and explicit paragraphs',()=>{
  expect(paragraphs([line('中文',100),line('第二行',86),line('Hello',60,{newParagraph:true}),line('world-',46),line('next',32)])).toEqual([{text:'中文第二行',style:'body'},{text:'Hello world-next',style:'body'}]);
  expect(paragraphs([line('A',100),line('B',86)],true)).toHaveLength(2);
 });
 it('maps OCR lines through crop translation, source rotation and deskew',()=>{
  const info={id:'p',sourceId:'s',sourceName:'a',pageIndex:0,currentPage:1};
  const p=ocrPage(info,{text:'中文',confidence:80,lines:[{text:'中文',confidence:80,bbox:{x0:10,y0:20,x1:50,y1:40},paragraph:0,words:[]}]},{width:200,height:300,transform:[0,2,2,0,-20,-40]});
  const m=p.layout![0].matrix!;expect(point(m,0,0)).toEqual([40,15]);expect(point(m,40/2,20/2)).toEqual([30,35]);
 });
 it('undoes the OCR engine deskew angle rather than rotating the original twice',()=>{
  const info={id:'p',sourceId:'s',sourceName:'a',pageIndex:0,currentPage:1};
  const p=ocrPage(info,{text:'line',confidence:90,rotateRadians:-.08,lines:[{text:'line',confidence:90,bbox:{x0:150,y0:220,x1:700,y1:250},paragraph:0,words:[]}]},{width:1200,height:1000,transform:[1,0,0,-1,0,1000]});
  const m=p.layout![0].matrix!;expect(m[0]).toBeCloseTo(Math.cos(.08));expect(m[1]).toBeCloseTo(-Math.sin(.08));
 });
 it('generates editable headings, real lists and source-page breaks',async()=>{
  const info={id:'p',sourceId:'s',sourceName:'a',pageIndex:0,currentPage:1};
  const layout=[line('标题',120,{style:'heading1' as const}),line('1. 第一项',100,{style:'number' as const}),line('• 第二项',80,{style:'bullet' as const}),line('中文',60),line('续行',46)];
  const zip=await JSZip.loadAsync(await generateWord([{...info,lines:layout.map(l=>l.text),layout},{...info,id:'q',lines:['Next page']}]));
  const xml=await zip.file('word/document.xml')!.async('string');expect(xml).toContain('Heading1');expect(xml).toContain('中文续行');expect(xml.match(/<w:numPr>/g)).toHaveLength(2);expect(xml.match(/<w:pageBreakBefore/g)).toHaveLength(1);
  expect(await zip.file('word/numbering.xml')!.async('string')).toContain('decimal');
 });
});
