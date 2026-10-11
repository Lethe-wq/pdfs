// Browser-independent QA of actual OCR geometry, invisible PDF layer and Word XML.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createOcrEngine,recognizeOcrImage} from '../src/ocr-engine.ts';
import {ocrScale} from '../src/ocr-pages.ts';
import {ocrPage} from '../src/text-drafts.ts';
import {addSearchableText} from '../src/searchable-pdf.ts';
import {generateWord} from '../src/word-engine.ts';
import JSZip from 'jszip';
const [input,prefix='tmp/pdfs/text-workflow-proof']=process.argv.slice(2);if(!input)throw new Error('Pass local PDF');
await mkdir(dirname(resolve(prefix)),{recursive:true});
const requirePdf=createRequire(import.meta.resolve('pdfjs-dist/package.json')), {createCanvas}=requirePdf('@napi-rs/canvas');
const original=new Uint8Array(await readFile(input));
const pdf=await getDocument({data:original.slice(),standardFontDataUrl:`${resolve('public/pdf-assets/standard_fonts')}/`,cMapUrl:`${resolve('public/pdf-assets/cmaps')}/`,cMapPacked:true,wasmUrl:`${resolve('public/pdf-assets/wasm')}/`}).promise;
const worker=await createOcrEngine({workerPath:resolve(dirname(fileURLToPath(import.meta.resolve('tesseract.js/package.json'))),'src/worker-script/node/index.js'),langPath:resolve('public/ocr-assets/lang'),cacheMethod:'none'});
const start=performance.now(),pages=[],reports=[];
try {
 for(let i=0;i<pdf.numPages;i++) {
  const page=await pdf.getPage(i+1),natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:ocrScale(natural.width,natural.height)});
  const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,viewport,background:'rgb(255,255,255)'}).promise;
  const result=await recognizeOcrImage(worker,canvas.toBuffer('image/png'));
  const info={id:`p${i}`,sourceId:'s',sourceName:'local.pdf',pageIndex:i,currentPage:i+1};
  const converted=ocrPage(info,result,{width:canvas.width,height:canvas.height,transform:viewport.transform});
  assert.ok(converted.lines.length,`Page ${i+1} must yield text`);pages.push(converted);
  const report={page:i+1,lines:converted.lines.length,chars:result.text.length,rotateRadians:result.rotateRadians,imageWidth:result.imageWidth,imageHeight:result.imageHeight};reports.push(report);
  if((i+1)%10===0||pdf.numPages<10)console.log(JSON.stringify(report));canvas.width=1;canvas.height=1;page.cleanup();
 }
 const font=await readFile('public/fonts/NotoSansCJKsc-Regular.ttf');
 const searchable=await addSearchableText(original,pages.map(p=>p.layout),font);await writeFile(`${prefix}.pdf`,searchable);
 const loaded=await getDocument({data:searchable.slice()}).promise;
 for(let i=0;i<pages.length;i++) {const text=(await (await loaded.getPage(i+1)).getTextContent()).items.filter(i=>'str' in i).map(i=>i.str).join('');assert.ok(text.includes(pages[i].lines[0]));}
 await loaded.destroy();
 const word=await generateWord(pages);await writeFile(`${prefix}.docx`,new Uint8Array(word));const zip=await JSZip.loadAsync(word),xml=await zip.file('word/document.xml').async('string');assert.equal((xml.match(/<w:pageBreakBefore/g)??[]).length,pages.length-1);
 const report={pages:pages.length,inputMiB:+(original.length/2**20).toFixed(2),elapsedMs:Math.round(performance.now()-start),peakRssMiB:+(process.resourceUsage().maxRSS/1024).toFixed(1),scope:'Node OCR + geometry + searchable PDF + Word; excludes browser responsiveness',reports};await writeFile(`${prefix}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reports:undefined}));
}finally{await worker.terminate();await pdf.destroy();}
