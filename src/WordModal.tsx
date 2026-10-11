import { useEffect, useState } from 'react';
import { Download, FileText, LoaderCircle, ScanText } from 'lucide-react';
import { Modal } from './components';
import type { useWordExport } from './use-word-export';
import type { Task } from './use-task';
import type { TextStyle } from './text-layout';
import { editablePage } from './text-drafts';
import OcrPreview from './OcrPreview';
export default function WordModal({word,task}:{word:ReturnType<typeof useWordExport>;task:Task}) {
  const [activeId,setActiveId]=useState(''),[lineId,setLineId]=useState(''),[zoom,setZoom]=useState(1);
  const {busy,progress,cancelling,cancel}=task;
  const {snapshot,scope,setScope,outputName,setOutputName,originalLines,setOriginalLines,targetDrafts,summary,runOcr,error,close,check,generate,canGenerate,targetCount,mode,review,exclude,updateLine}=word;
  const active=targetDrafts.find(d=>d.info.id===activeId)??targetDrafts[0];
  const page=active&&editablePage(active),layout=page?.layout??[],line=layout.find(l=>l.id===lineId);
  useEffect(()=>{setLineId('');},[active?.info.id]);
  if(!snapshot)return null;
  const noText=targetDrafts.filter(d=>!editablePage(d)?.lines.some(t=>t.trim()));
  return <Modal title="文字检查与校对" subtitle={mode==='word'?'生成可编辑 Word，按当前页面顺序转换。':'保留原页面外观，添加可搜索、可复制的文字层。'} onClose={close} busy={!!busy} wide>
    <fieldset className="word-scope" disabled={!!busy}><legend>转换范围</legend>
      <label><input type="radio" name="word-scope" checked={scope==='all'} onChange={()=>setScope('all')}/>全部页面 <span>{snapshot.all.length} 页</span></label>
      <label><input type="radio" name="word-scope" checked={scope==='selection'} disabled={!snapshot.selection.length} onChange={()=>setScope('selection')}/>选中页面 <span>{snapshot.selection.length} 页</span></label>
    </fieldset>
    <label className="field-label" htmlFor="word-name">输出文件名</label><div className="filename-field"><input id="word-name" value={outputName} onChange={e=>setOutputName(e.target.value)} maxLength={150} disabled={!!busy}/><span>{mode==='word'?'.docx':'.pdf'}</span></div>
    <p className="conversion-boundary">文件只在浏览器内处理。关闭窗口保留识别及校对草稿。{mode==='word'?'Word 保留文字、基本段落、标题和列表；表格、公式、图片及复杂版式不保证恢复，不应用工作区旋转。':'PDF 保留当前顺序、尺寸和旋转。已有文字层继续保留，本轮不修复或替换原文字层。'}</p>
    <div className="review-status" aria-live="polite">已检查 {summary.done} / {targetCount} 页 · OCR 已识别 {summary.ocr} 页
      <button className="secondary-button" disabled={!!busy||!targetCount} onClick={()=>void check()}><FileText size={15}/>检查／继续检查</button>
      <button className="secondary-button" disabled={!!busy||!targetCount} onClick={()=>void check(true)}>重新检查全部</button>
      <button className="secondary-button" disabled={!!busy||!targetCount||summary.done===0} onClick={()=>void runOcr()}><ScanText size={15}/>继续识别／重试失败页</button>
    </div>
    {active&&<><div className="review-navigation"><label>校对页面 <select aria-label="校对页面" value={active.info.id} disabled={!!busy} onChange={e=>setActiveId(e.target.value)}>{targetDrafts.map(d=><option key={d.info.id} value={d.info.id}>第 {d.info.currentPage} 页 · {d.info.sourceName} · {d.reviewed?'已核对':d.excluded?'不添加文字':d.error?'失败':d.ocrStatus==='processing'?'识别中':d.checkStatus==='pending'?'待检查':'待核对'}</option>)}</select></label>
      <label>缩放 <select aria-label="原页缩放" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[.75,1,1.5,2].map(n=><option key={n} value={n}>{Math.round(n*100)}%</option>)}</select></label></div>
      <p className="review-origin">当前第 {active.info.currentPage} 页 · {active.info.sourceName} · 原第 {active.info.pageIndex+1} 页</p>
      <div className="review-columns"><OcrPreview page={active.info} line={line} zoom={zoom}/><section className="review-text" aria-label="逐行校对">
        {!layout.length&&<p>此页尚无可用文字。请先检查，再运行 OCR；没有文字的页面可明确确认不添加文字。</p>}
        {layout.map(l=><div className={`review-line ${l.id===lineId?'active':''}`} key={l.id}>
          {l.confidence!==undefined&&l.confidence<70&&<small>此行识别把握较低，请对照原页核对</small>}
          <textarea aria-label={`文字行 ${layout.indexOf(l)+1}`} value={l.text} disabled={!!busy} spellCheck={false} onFocus={()=>setLineId(l.id)} onChange={e=>updateLine(active.info.id,l.id,{text:e.target.value.replace(/\r?\n/g,' ')})}/>
          <div className="line-options"><label><input type="checkbox" checked={!!l.newParagraph} disabled={!!busy} onChange={e=>updateLine(active.info.id,l.id,{newParagraph:e.target.checked})}/>另起段落</label><select aria-label={`文字行 ${layout.indexOf(l)+1} 样式`} value={l.style??'auto'} disabled={!!busy} onChange={e=>updateLine(active.info.id,l.id,{style:e.target.value==='auto'?undefined:e.target.value as TextStyle})}><option value="auto">自动判断</option><option value="body">正文</option><option value="heading1">一级标题</option><option value="heading2">二级标题</option><option value="bullet">项目列表</option><option value="number">编号列表</option></select></div>
        </div>)}
      </section></div>
      {active.error&&<p className="inline-error" role="alert">{active.error}</p>}
      <div className="page-review-actions"><button className="secondary-button" disabled={!!busy} onClick={()=>void runOcr(active.info.id)}>{active.recognized?'重新识别此页':'对本页运行 OCR'}</button>
        {!!active.recognized&&<label><input type="checkbox" checked={active.reviewed} disabled={!!busy||!page?.lines.length} onChange={e=>review(active.info.id,e.target.checked)}/>此页 OCR 文字已核对</label>}
        <label><input type="checkbox" checked={active.excluded} disabled={!!busy} onChange={e=>exclude(active.info.id,e.target.checked)}/>{mode==='word'?'确认不转换此页':'确认保留原页，不添加识别文字'}</label>
      </div>
      {!!active.native&&mode==='searchable'&&<p>此页已有原文字层，导出将保留原文字层。校对修改仅用于 Word。</p>}
    </>}
    {!!noText.length&&<details className="missing-pages"><summary>无可用文字／尚未完成检查：{noText.length} 页</summary><ul>{noText.map(d=><li key={d.info.id}>当前第 {d.info.currentPage} 页 · {d.info.sourceName} · 原第 {d.info.pageIndex+1} 页{d.excluded?'（已确认不添加文字）':''}</li>)}</ul></details>}
    {mode==='word'&&<label className="word-confirm"><input type="checkbox" checked={originalLines} disabled={!!busy} onChange={e=>setOriginalLines(e.target.checked)}/>按原行分段（不自动合并段落）</label>}
    {!canGenerate&&<p className="conversion-boundary">请完成页面检查，核对 OCR 页面，并逐页确认不使用的文字；文件名不能为空。Word 至少需要一页有效文字。</p>}
    {busy&&<div className="processing" role="status"><LoaderCircle className="spin" size={17}/><span>{busy}</span>{progress!==null&&<small>{progress}%</small>}</div>}
    {error&&<p className="inline-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="secondary-button" onClick={busy?cancel:close} disabled={cancelling}>{busy?'取消处理':'关闭并保留草稿'}</button><button className="primary-button" onClick={()=>void generate()} disabled={!!busy||!canGenerate}><Download size={16}/>生成并下载 {mode==='word'?'Word':'PDF'}</button></div>
  </Modal>;
}
