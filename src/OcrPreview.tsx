import { useEffect, useRef, useState } from 'react';
import type { TextLine } from './text-layout';
import type { WordPageInfo } from './word-protocol';
import { getPreview, renderSlot } from './preview';
import { point } from './text-drafts';
export default function OcrPreview({page,line,zoom}:{page:WordPageInfo;line?:TextLine;zoom:number}) {
  const canvas=useRef<HTMLCanvasElement>(null),[transform,setTransform]=useState<number[]>([]),[size,setSize]=useState({width:1,height:1}),[error,setError]=useState('');
  useEffect(()=> {
    let cancelled=false;let stop:(()=>void)|undefined;
    setError('');setTransform([]);
    void renderSlot(async()=> {
      const doc=await getPreview(page.sourceId),pdfPage=await doc.getPage(page.pageIndex+1);
      const natural=pdfPage.getViewport({scale:1}),viewport=pdfPage.getViewport({scale:Math.min(620/natural.width,850/natural.height)*zoom});
      const offscreen=document.createElement('canvas');offscreen.width=Math.ceil(viewport.width);offscreen.height=Math.ceil(viewport.height);
      if(cancelled)return;
      const task=pdfPage.render({canvas:offscreen,viewport});stop=()=>task.cancel();await task.promise;
      if(cancelled||!canvas.current)return;
      canvas.current.width=offscreen.width;canvas.current.height=offscreen.height;canvas.current.getContext('2d')!.drawImage(offscreen,0,0);
      setSize({width:viewport.width,height:viewport.height});
      setTransform([...viewport.transform]);
      offscreen.width=0;offscreen.height=0;
    }).catch(e=>{if(!cancelled)setError(`原页预览失败：${e.message}`);});
    return()=>{cancelled=true;stop?.();};
  },[page.sourceId,page.pageIndex,zoom]);
  const shape=line?.matrix&&transform.length?[[0,0],[line.width,0],[line.width,line.height],[0,line.height]].map(([x,y])=>point(transform,...point(line.matrix!,x,y))).map(p=>p.join(',')).join(' '):'';
  return <div className="ocr-preview-scroll"><div className="ocr-preview-paper" style={{width:size.width,height:size.height}}><canvas ref={canvas}/>{shape&&<svg viewBox={`0 0 ${size.width} ${size.height}`} aria-label="当前文字行位置"><polygon points={shape}/></svg>}</div>{error&&<p role="alert">{error}</p>}</div>;
}
