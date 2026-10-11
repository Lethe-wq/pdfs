import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url),viteRequire=createRequire(require.resolve('vite/package.json'));
const {build}=await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
await build({entryPoints:['src/pdf-client.ts'],outfile:'tmp/pdfs/searchable-client.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {PdfClient}=await import('../tmp/pdfs/searchable-client.mjs');
const entry=(await readdir('dist/assets')).find(name=>/^pdf\.worker-[^.]+\.js$/.test(name));assert(entry);
let attempts=0,started=()=>{};
class Port {
 onmessage=null;onerror=null;onmessageerror=null;
 constructor(){this.thread=new Worker(new URL('../tests/worker-host.mjs',import.meta.url),{workerData:{entry:pathToFileURL(resolve('dist/assets',entry)).href,failKind:attempts++===0?'searchable':undefined}});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',()=>this.onerror?.({preventDefault(){}}));this.thread.on('messageerror',()=>this.onmessageerror?.({}));}
 postMessage(message,transfer){this.thread.postMessage(message,transfer);if(message.kind==='searchable')started();}
 terminate(){void this.thread.terminate();}
}
const client=new PdfClient(()=>new Port());
try {
 const source=await PDFDocument.create();source.addPage([400,500]);source.addPage([600,800]);await client.import('s',new Blob([await source.save()]));
 const pages=[{id:'second',sourceId:'s',pageIndex:1,rotation:90},{id:'first',sourceId:'s',pageIndex:0,rotation:0}],layers={second:[{id:'l',text:'校对文字 中文 ABC 123',x:40,y:200,width:300,height:18}]},url='http://127.0.0.1:5173/fonts/NotoSansCJKsc-Regular.ttf';
 let recovery=0;const bytes=await client.searchable(pages,layers,url,{onRecovery:()=>recovery++});assert.ok(recovery>0);assert.equal(attempts,2);
 const pdf=await PDFDocument.load(bytes);assert.deepEqual(pdf.getPages().map(p=>[p.getWidth(),p.getRotation().angle]),[[600,90],[400,0]]);
 const preview=await getDocument({data:new Uint8Array(bytes.slice(0))}).promise;const text=(await(await preview.getPage(1)).getTextContent()).items.filter(i=>'str' in i).map(i=>i.str).join('');assert.ok(text.includes('校对文字 中文 ABC 123'));await preview.destroy();await writeFile('tmp/pdfs/searchable-worker.pdf',new Uint8Array(bytes));
 const controller=new AbortController(),requestStarted=new Promise(resolve=>{started=resolve;});const pending=client.searchable(pages,layers,url,{signal:controller.signal});const rejected=assert.rejects(pending,e=>e.name==='TaskCancelledError');await requestStarted;controller.abort();await rejected;
 const next=await client.searchable(pages,layers,url);assert.equal((await PDFDocument.load(next)).getPageCount(),2);
 console.log('Production searchable Worker: crash/retry, exact page order/rotation/Unicode, cancel and reuse passed.');
}finally{client.dispose();}
