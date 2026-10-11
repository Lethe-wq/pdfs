import { describe,it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PDFDocument,degrees,rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { addSearchableText } from './searchable-pdf';
import { ocrPage } from './text-drafts';
const requireHere=createRequire(import.meta.url);
const requirePdf=createRequire(requireHere.resolve('pdfjs-dist/package.json'));
const {createCanvas}=requirePdf('@napi-rs/canvas');
const font=await readFile('public/fonts/NotoSansCJKsc-Regular.ttf');
async function raster(bytes:Uint8Array,pageNumber:number) {
 const doc=await getDocument({data:bytes.slice()}).promise,page=await doc.getPage(pageNumber),viewport=page.getViewport({scale:1});
 const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,viewport}).promise;
 const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
 const text=(await page.getTextContent()).items.filter(i=>'str' in i).map(i=>'str' in i?i.str:'').join('');
 const items=(await page.getTextContent()).items.filter(i=>'str' in i);
 await doc.destroy();return {pixels,text,items};
}
describe('searchable PDF text layer',()=>{
 it('preserves visuals, mixed sizes, crop boxes and rotations while exposing edited Chinese Unicode',async()=>{
  const pdf=await PDFDocument.create();
  for(const rotation of [0,90,180,270]){const p=pdf.addPage([400+rotation,500]);p.setCropBox(20,30,340,410);p.setRotation(degrees(rotation));p.drawRectangle({x:40,y:200,width:180,height:40,color:rgb(.2,.3,.4)});}
  const original=await pdf.save();
  const layout=[{id:'l',text:'校对后的中文 ABC 123',x:50,y:200,width:220,height:18,matrix:[1,0,0,1,50,200]}];
  const output=await addSearchableText(original,[layout,layout,layout,[]],font);
  const generated=await PDFDocument.load(output);expect(generated.getPageCount()).toBe(4);
  for(let i=0;i<4;i++){expect(generated.getPage(i).getCropBox()).toEqual(pdf.getPage(i).getCropBox());expect(generated.getPage(i).getRotation().angle).toBe(i*90);const before=await raster(original,i+1),after=await raster(output,i+1);expect(after.pixels).toEqual(before.pixels);expect(after.text).toBe(i===3?'':'校对后的中文 ABC 123');}
 });
 it('maps a source-rotated OCR line through a nonzero cropped viewport',async()=>{
  const pdf=await PDFDocument.create(),p=pdf.addPage([400,500]);p.setCropBox(20,30,340,410);p.setRotation(degrees(90));const original=await pdf.save();
  const doc=await getDocument({data:original.slice()}).promise,source=await doc.getPage(1),viewport=source.getViewport({scale:2});
  const info={id:'p',sourceId:'s',sourceName:'s',pageIndex:0,currentPage:1};
  const recognized=ocrPage(info,{text:'中文',confidence:90,lines:[{text:'中文',confidence:90,bbox:{x0:80,y0:100,x1:200,y1:130},paragraph:0,words:[]}]},{width:viewport.width,height:viewport.height,transform:viewport.transform});
  const output=await addSearchableText(original,[recognized.layout!],font);const after=await raster(output,1);
  expect(after.text).toBe('中文');const item=after.items[0];if(!('transform' in item))throw new Error();expect(item.transform[4]).toBeCloseTo(recognized.layout![0].matrix![4],4);expect(item.transform[5]).toBeCloseTo(recognized.layout![0].matrix![5],4);await doc.destroy();
 });
 it('rejects unsupported characters atomically and allows an image-only result',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
  await expect(addSearchableText(bytes,[[{id:'l',text:'🦄',x:0,y:0,width:50,height:20}]],font)).rejects.toThrow('不支持');
  const output=await addSearchableText(bytes,[[]],new Uint8Array());expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
 });
});
