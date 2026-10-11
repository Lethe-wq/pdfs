import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageItem, SourceFile } from './model';
import { getPreview } from './preview';
import { readPageText } from './pdf-text';
import { analyzeWordPages } from './word-text';
import { WordClient } from './word-client';
import { OcrClient } from './ocr-client';
import { checkCancelled, TaskCancelledError } from './task-errors';
import { editablePage, newDraft, ocrPage, type PageDraft, type TextDrafts } from './text-drafts';
import type { TextLine } from './text-layout';
import type { WordPage, WordPageInfo } from './word-protocol';
import type { Task } from './use-task';
import type { Notice } from './use-import';
import { pdfClient } from './pdf-client';

export function useWordExport(task:Task,pages:PageItem[],selectedPages:PageItem[],sources:Map<string,SourceFile>,notify:(notice:Notice|null)=>void,markGenerated:(pages:PageItem[])=>void) {
  const [snapshot,setSnapshot]=useState<{all:WordPageInfo[];selection:WordPageInfo[]}|null>(null);
  const [mode,setMode]=useState<'word'|'searchable'>('word'),[scope,setScope]=useState<'all'|'selection'>('all');
  const [outputName,setOutputName]=useState('转换后的文档'),[originalLines,setOriginalLines]=useState(false);
  const [drafts,setDraftsState]=useState<TextDrafts>({}),[error,setError]=useState('');
  const [download,setDownload]=useState<{url:string;name:string;kind:'word'|'searchable'}|null>(null);
  const [textDirty,setTextDirty]=useState(false);
  const draftsRef=useRef(drafts),client=useRef<WordClient|null>(null),ocrClient=useRef<OcrClient|null>(null),lastUrl=useRef<string|null>(null);
  const {begin,update,finish}=task;
  const setDrafts=useCallback((value:TextDrafts)=> {draftsRef.current=value;setDraftsState(value);},[]);
  const patch=useCallback((info:WordPageInfo,value:Partial<PageDraft>)=> {
    const next={...draftsRef.current,[info.id]:{...(draftsRef.current[info.id]??newDraft(info)),...value,info}};
    setDrafts(next);
  },[setDrafts]);
  const close=useCallback(()=> {setSnapshot(null);setError('');client.current?.dispose();client.current=null;ocrClient.current?.dispose();ocrClient.current=null;},[]);
  useEffect(()=>()=> {client.current?.dispose();ocrClient.current?.dispose();if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);},[]);
  const open=useCallback((kind:'word'|'searchable'='word')=> {
    if(!pages.length)return;
    const all=pages.map((p,index)=>({id:p.id,sourceId:p.sourceId,sourceName:sources.get(p.sourceId)!.name,pageIndex:p.pageIndex,currentPage:index+1}));
    const ids=new Set(selectedPages.map(p=>p.id));
    setSnapshot({all,selection:all.filter(p=>ids.has(p.id))});setScope('all');setMode(kind);setOutputName(kind==='word'?'转换后的文档':'可搜索的文档');setError('');notify(null);
  },[pages,selectedPages,sources,notify]);
  const target=snapshot?.[scope]??[];
  const targetDrafts=target.map(info=>({...drafts[info.id]??newDraft(info),info}));
  const check=async(force=false)=> {
    if(!target.length)return;
    if(force&&target.some(p=>draftsRef.current[p.id]?.recognized)&&!window.confirm('重新检查会在成功检查后清除这些页面的 OCR 修改，继续吗？'))return;
    const todo=target.filter(p=>force||!draftsRef.current[p.id]||['pending','failed'].includes(draftsRef.current[p.id].checkStatus));
    if(!todo.length)return;
    const controller=begin('正在检查文字页面…');if(!controller)return;setError('');
    try {
      for(let i=0;i<todo.length;i++) {
        const info=todo[i];checkCancelled(controller.signal);patch(info,{checkStatus:'processing',error:undefined});
        try {
          update(controller,`正在检查：${i+1} / ${todo.length} 页`,Math.round(i/todo.length*100));
          const doc=await getPreview(info.sourceId),page=await doc.getPage(info.pageIndex+1);
          const items=await readPageText(page,controller.signal);checkCancelled(controller.signal);
          const result=analyzeWordPages([{...info,items}]);
          patch(info,{checkStatus:result.pages.length?'success':'empty',native:result.pages[0],...(force?{recognized:undefined,reviewed:false,excluded:false,ocrStatus:'pending' as const}:{}),error:undefined});
          setTextDirty(true);
        }catch(e) {
          if(controller.signal.aborted){patch(info,{checkStatus:'pending'});throw e;}
          patch(info,{checkStatus:'failed',error:`检查失败：${(e as Error).message}`});
        }
      }
    }catch(e){setError(e instanceof TaskCancelledError?'已取消检查，完成页已保留，可继续检查。':(e as Error).message);}
    finally{finish(controller);}
  };
  const runOcr=async(id?:string)=> {
    const todo=target.filter(info=>id?info.id===id:!draftsRef.current[info.id]?.native&&!draftsRef.current[info.id]?.excluded&&draftsRef.current[info.id]?.ocrStatus!=='success'&&draftsRef.current[info.id]?.ocrStatus!=='empty');
    if(!todo.length)return;
    if(id&&draftsRef.current[id]?.recognized&&!window.confirm('重新识别成功后会替换此页的文字修改，继续吗？'))return;
    const controller=begin('正在准备 OCR…');if(!controller)return;setError('');
    const asset=(path:string)=>new URL(`${import.meta.env.BASE_URL}ocr-assets/${path}`,window.location.href).href;
    const ocr=new OcrClient({workerPath:asset('worker.min.js'),corePath:asset('core/'),langPath:asset('lang/')});ocrClient.current=ocr;
    try {
      const {renderOcrRaster}=await import('./ocr-render');
      for(let i=0;i<todo.length;i++) {
        const info=todo[i],old=draftsRef.current[info.id];checkCancelled(controller.signal);patch(info,{ocrStatus:'processing',error:undefined});
        try {
          const raster=await renderOcrRaster(info,controller.signal);
          const result=await ocr.recognize(raster.image,{signal:controller.signal,onRecovery:()=>update(controller,`正在重试第 ${info.currentPage} 页 OCR…`),progress:(fraction,status)=>update(controller,status==='recognizing text'?`正在 OCR：${i+1} / ${todo.length} 页`:'正在加载中英文 OCR 模型…',Math.round((i+(status==='recognizing text'?Math.max(0,Math.min(1,fraction)):0))/todo.length*100))});
          checkCancelled(controller.signal);
          const recognized=ocrPage(info,result,raster.geometry);
          patch(info,{ocrStatus:recognized.lines.some(t=>/[\p{L}\p{N}]/u.test(t))?'success':'empty',recognized:recognized.lines.length?recognized:undefined,reviewed:false,excluded:false,error:undefined});setTextDirty(true);
        }catch(e){
          if(controller.signal.aborted){patch(info,{ocrStatus:old?.recognized?'success':'pending'});throw e;}
          patch(info,{ocrStatus:old?.recognized?'success':'failed',error:`OCR 失败：${(e as Error).message}`});
        }
      }
    }catch(e){setError(e instanceof TaskCancelledError?'已取消 OCR，已完成页、修改及上次下载保留，可继续识别。':(e as Error).message);}
    finally{ocr.dispose();if(ocrClient.current===ocr)ocrClient.current=null;finish(controller);}
  };
  const updateLine=(id:string,lineId:string,value:Partial<TextLine>)=> {
    const draft=draftsRef.current[id];if(!draft)return;
    const field=draft.recognized?'recognized':'native';const page=draft[field];if(!page?.layout)return;
    const layout=page.layout.map(line=>line.id===lineId?{...line,...value,...(value.text!==undefined?{words:undefined}:{})}:line);
    patch(draft.info,{[field]:{...page,layout,lines:layout.map(l=>l.text).filter(t=>t.trim())},reviewed:false});setTextDirty(true);
  };
  const review=(id:string,reviewed:boolean)=>{const d=draftsRef.current[id];if(d){patch(d.info,{reviewed});setTextDirty(true);}};
  const exclude=(id:string,excluded:boolean)=>{const d=draftsRef.current[id];if(d){patch(d.info,{excluded});setTextDirty(true);}};
  const eligible=targetDrafts.filter(d=>!d.excluded&&editablePage(d)?.lines.some(t=>t.trim()));
  const missing=targetDrafts.filter(d=>!d.excluded&&!editablePage(d)?.lines.some(t=>t.trim()));
  const requiresReview=targetDrafts.some(d=>!d.excluded&&!!d.recognized&&!(mode==='searchable'&&d.native)&&!d.reviewed);
  const unchecked=targetDrafts.some(d=>!d.excluded&&['pending','processing'].includes(d.checkStatus));
  const canGenerate=!!target.length&&!!outputName.trim()&&!unchecked&&!requiresReview&&!missing.length&&(mode==='searchable'||eligible.length>0);
  const generate=async()=> {
    if(!canGenerate)return;const controller=begin(mode==='word'?'正在生成 Word…':'正在生成可搜索 PDF…');if(!controller)return;setError('');
    try {
      let buffer:ArrayBuffer;
      if(mode==='word') {
        client.current??=new WordClient();
        const input:WordPage[]=eligible.map(d=>({...editablePage(d)!,...d.info,originalLines}));
        buffer=await client.current.generate(input,{signal:controller.signal,onRecovery:()=>update(controller,'正在重试 Word 生成…'),progress:(done,total)=>update(controller,`正在生成 Word：${done} / ${total}`,Math.round(done/total*100))});
      }else {
        const input=target.map(info=>pages.find(p=>p.id===info.id)!);
        const textLayers=Object.fromEntries(targetDrafts.filter(d=>!d.excluded&&!d.native&&d.recognized&&d.reviewed).map(d=>[d.info.id,d.recognized!.layout??[]]));
        const fontUrl=new URL(`${import.meta.env.BASE_URL}fonts/NotoSansCJKsc-Regular.ttf`,window.location.href).href;
        buffer=await pdfClient.searchable(input,textLayers,fontUrl,{signal:controller.signal,onRecovery:()=>update(controller,'正在重试可搜索 PDF…'),progress:(done,total)=>update(controller,`正在写入文字层：${done} / ${total}`,Math.round(done/total*100))});

      }
      checkCancelled(controller.signal);
      const name=outputName.trim().replace(/\.(docx|pdf)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)+(mode==='word'?'.docx':'.pdf');
      const url=URL.createObjectURL(new Blob([buffer],{type:mode==='word'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'}));
      if(lastUrl.current)URL.revokeObjectURL(lastUrl.current);lastUrl.current=url;setDownload({url,name,kind:mode});if(scope==='all'&&mode==='word')setTextDirty(false);if(mode==='searchable'&&scope==='all')markGenerated(target.map(info=>pages.find(p=>p.id===info.id)!));
      const link=document.createElement('a');link.href=url;link.download=name;try{document.body.appendChild(link);link.click();}catch{/* Persistent download remains available. */}finally{link.remove();}
      notify({kind:'success',text:`已生成 ${name}，可使用下载链接再次下载。${mode==='searchable'&&!targetDrafts.some(d=>!d.excluded&&d.recognized&&!d.native)?'本次未新增识别文字层。':''}`});
    }catch(e){setError(e instanceof TaskCancelledError?'已取消生成，草稿和上次下载仍保留。':`生成失败：${(e as Error).message}`);}
    finally{finish(controller);}
  };
  const summary=useMemo(()=>({done:targetDrafts.filter(d=>!['pending','processing'].includes(d.checkStatus)).length,ocr:targetDrafts.filter(d=>d.recognized).length}),[targetDrafts]);
  return {snapshot,mode,scope,setScope,outputName,setOutputName,originalLines,setOriginalLines,drafts,setDrafts,textDirty,setTextDirty,targetDrafts,targetCount:target.length,summary,missing,canGenerate,open,close,check,runOcr,updateLine,review,exclude,error,generate,download};
}
