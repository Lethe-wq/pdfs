import { useEffect, useRef, useState } from 'react';
import { deleteSavedWorkspace, readSavedWorkspace, writeSavedWorkspace, type SavedWorkspace } from './draft-storage';
import { pdfClient } from './pdf-client';
import type { Snapshot } from './model';
import type { TextDrafts } from './text-drafts';
export function useDraftStorage(workspace:Snapshot,text:TextDrafts,generatedKey:string|null) {
  const [enabled,setEnabled]=useState(false),[pending,setPending]=useState<SavedWorkspace>(),[status,setStatus]=useState(''),[unsaved,setUnsaved]=useState(false);
  const mounted=useRef(true), generation=useRef(0), queue=useRef(Promise.resolve());
  const relevantText=Object.fromEntries(Object.entries(text).filter(([,d])=>workspace.sources.some(s=>s.id===d.info.sourceId)));
  const current=useRef({workspace,text:relevantText,generatedKey}); current.current={workspace,text:relevantText,generatedKey};
  const previousStatus=useRef('');
  useEffect(()=> {mounted.current=true;readSavedWorkspace().then(value=> {if(mounted.current)setPending(value);}).catch(error=>{if(mounted.current)setStatus(`本机草稿不可用：${error.message}`);});return()=>{mounted.current=false;};},[]);
  const enqueue=(action:()=>Promise<void>)=> {const result=queue.current.then(action);queue.current=result.catch(()=>{});return result;};
  useEffect(()=> {
    if(!enabled)return;
    const token=++generation.current;setUnsaved(true);setStatus('正在保存到本机…');
    const signature=Object.values(text).map(d=>`${d.info.id}:${d.checkStatus}:${d.ocrStatus}`).join('|');
    const delay=signature!==previousStatus.current?0:300;previousStatus.current=signature;
    const timer=setTimeout(()=> {void enqueue(async()=> {
      if(token!==generation.current)return;
      const value=current.current;
      const ids=new Set([...value.workspace.sources.map(s=>s.id),...Object.values(value.text).map(d=>d.info.sourceId)]);
      const files=pdfClient.sourceFiles(ids);
      await writeSavedWorkspace({version:1,savedAt:Date.now(),...value,files});
      if(mounted.current&&token===generation.current){setUnsaved(false);setStatus('已保存到此浏览器');}
    }).catch(error=>{if(mounted.current&&token===generation.current){setUnsaved(true);setStatus(`未保存到本机：${error.message}`);}});},delay);
    return()=>clearTimeout(timer);
  },[workspace,text,generatedKey,enabled]);
  const saveNow=async()=> {
    if(!enabled)return;
    const token=++generation.current;
    setUnsaved(true);setStatus('正在保存到本机…');
    try {await enqueue(async()=>{const value=current.current;const ids=new Set([...value.workspace.sources.map(s=>s.id),...Object.values(value.text).map(d=>d.info.sourceId)]);await writeSavedWorkspace({version:1,savedAt:Date.now(),...value,files:pdfClient.sourceFiles(ids)});});if(token===generation.current){setUnsaved(false);setStatus('已保存到此浏览器');}}
    catch(error){setUnsaved(true);setStatus(`未保存到本机：${(error as Error).message}`);}
  };
  const disable=async()=> {++generation.current;setEnabled(false);try{await enqueue(deleteSavedWorkspace);setPending(undefined);setUnsaved(false);setStatus('本机缓存已删除');}catch(error){setUnsaved(true);setStatus(`删除缓存失败：${(error as Error).message}`);}};
  return {enabled,setEnabled,pending,setPending,status,unsaved,saveNow,disable};
}
