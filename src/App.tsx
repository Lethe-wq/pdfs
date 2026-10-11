import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowDownToLine, ArrowUpToLine, Check, ChevronLeft, ChevronRight, Download, FilePlus2, Files, FileText, GripVertical, HardDrive, Layers3, LoaderCircle, LockKeyhole, Plus, Redo2, RotateCw, Scissors, ScanText, ShieldCheck, Trash2, Undo2, Upload, X } from 'lucide-react';
import { fileSize } from './model';
import { EndZone, Modal, PageCard, SourceRow } from './components';
import PdfCanvas from './PdfCanvas';
import { useTask } from './use-task';
import { useWorkspace } from './use-workspace';
import { useSelection } from './use-selection';
import { useImport, type Notice } from './use-import';
import { useExport } from './use-export';
import { useRecovery } from './use-recovery';
import { usePageDrag } from './use-page-drag';
import { useWordExport } from './use-word-export';
import WordModal from './WordModal';
import {useDraftStorage} from './use-draft-storage';
import {interruptedDrafts} from './text-drafts';
import {pdfClient} from './pdf-client';
import {registerPreview} from './preview';
import {checkCancelled} from './task-errors';
import {emptyHistory} from './model';

export default function App() {
  const task = useTask();
  const { busy, busyRef, progress, cancelling, cancel } = task;
  const { history, dispatch, sources, pages, dirty, commit, move, moveSource, removeSource, markGenerated, generatedKey, setGeneratedKey, sourcesById, sourceCounts, totalSize } = useWorkspace(busy);
  const { selected, setSelected, selectedPages, range, setRange, rangeError, setRangeError, selectPage, selectRange } = useSelection(pages);
  const [notice, setNotice] = useState<Notice | null>(null);
  const importFiles = useImport(task, sources.length, commit, setNotice);
  const { exportMode, setExportMode, outputName, setOutputName, splitRows, setSplitRows, splitResult, splitError, openExport, exportPdf, download } = useExport(task, pages, selectedPages, markGenerated, setNotice);
  const recover = useRecovery(task, setNotice);
  const word = useWordExport(task, pages, selectedPages, sourcesById, setNotice, markGenerated);
  const storage=useDraftStorage(history.present,word.drafts,generatedKey);
  const restoreDraft=async()=> {
    const saved=storage.pending;if(!saved)return;
    if(sources.length&&!window.confirm('恢复草稿将替换当前工作区，继续吗？'))return;
    const controller=task.begin('正在恢复本机草稿…');if(!controller)return;
    try {
      for(let i=0;i<saved.workspace.sources.length;i++) {
        const source=saved.workspace.sources[i],file=saved.files[source.id];
        if(!file)throw new Error(`草稿缺少原 PDF：${source.name}`);
        task.update(controller,`正在恢复：${i+1} / ${saved.workspace.sources.length}`,Math.round(i/saved.workspace.sources.length*100));
        const result=await pdfClient.import(source.id,file,{signal:controller.signal});
        await registerPreview(source.id,result.bytes,controller.signal);
      }
      checkCancelled(controller.signal);
      dispatch({type:'replace',snapshot:saved.workspace});setGeneratedKey(saved.generatedKey);word.setDrafts(interruptedDrafts(saved.text));word.setTextDirty(false);
      storage.setPending(undefined);storage.setEnabled(true);setNotice({kind:'success',text:'本机草稿已恢复；点击继续检查或继续识别可恢复未完成任务。'});
    }catch(e){setNotice({kind:'error',text:`恢复失败：${(e as Error).message}。当前工作区和原草稿保留。`});}
    finally{task.finish(controller);}
  };
  const clearWorkspace=async()=> {
    if(!window.confirm('清空工作区及本机缓存？原始文件不受影响。'))return;
    await storage.disable();word.close();word.setDrafts({});word.setTextDirty(false);dispatch({type:'replace',snapshot:emptyHistory.present});setGeneratedKey(null);setSelected(new Set());
  };
  const { drag, insertion, setDrag, setInsertion, dragStart, dragEnd, destination } = usePageDrag(pages, selected, sourcesById, move);
  const [externalDrag, setExternalDrag] = useState(false);
  const dragDepth = useRef(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previewPage = pages.find(page => page.id === previewId);
  const previewIndex = previewPage ? pages.indexOf(previewPage) : -1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const selectionIds = selected;
  const isSelected = selectedPages.length > 0;
  const movePage = useCallback((id: string, end: boolean) => move(selected.has(id) ? selected : new Set([id]), end ? pages.length : 0), [move, selected, pages.length]);

  useEffect(() => { if (previewId && !pages.some(page => page.id === previewId)) setPreviewId(null); }, [pages, previewId]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty || busyRef.current || storage.unsaved || (word.textDirty && !storage.enabled)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', listener);
    return () => window.removeEventListener('beforeunload', listener);
  }, [dirty, busyRef, storage.unsaved, storage.enabled, word.textDirty]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const element = event.target as HTMLElement;
      if (element.matches('input, textarea') || element.isContentEditable || exportMode || word.snapshot || previewId || help || busyRef.current) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (modifier && event.key.toLowerCase() === 'a' && pages.length) {
        event.preventDefault(); setSelected(new Set(pages.map(page => page.id)));
      } else if (event.key === 'Escape') setSelected(new Set());
      else if ((event.key === 'Delete' || event.key === 'Backspace') && selected.size && !element.closest('button')) {
        event.preventDefault(); commit(snapshot => ({ ...snapshot, pages: snapshot.pages.filter(page => !selected.has(page.id)) }));
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [pages, selected, exportMode, word.snapshot, previewId, help, commit, dispatch, setSelected, busyRef]);

  return <div className="app-shell" onDragEnter={event => {
    if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setExternalDrag(true); }
  }} onDragLeave={event => {
    if (event.dataTransfer.types.includes('Files')) { dragDepth.current--; if (dragDepth.current <= 0) setExternalDrag(false); }
  }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => {
    event.preventDefault(); dragDepth.current = 0; setExternalDrag(false);
    if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
  }}>
    <input type="file" ref={input} accept=".pdf,application/pdf" multiple hidden onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
    <header className="app-header">
      <a href="#" className="brand" onClick={event => event.preventDefault()}><span className="brand-mark"><Layers3 size={23} /></span><span className="brand-name">页序<small>PDF WORKSPACE</small></span></a>
      <div className="header-middle"><span className="local-dot" />本地 PDF 工作台</div>
      <div className="header-right"><span className="privacy"><ShieldCheck size={15} />文件只在你的设备上处理</span><button className="help-button" onClick={() => setHelp(true)}>使用说明</button></div>
    </header>

    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={dragStart} onDragOver={event => setInsertion(destination(event))} onDragEnd={dragEnd} onDragCancel={() => { setDrag(null); setInsertion(null); }}>
      <div className="workspace-layout">
        <aside className="sidebar">
          <div className="sidebar-heading"><h2>来源文件 <span>{sources.length}</span></h2><span className="eyebrow">FILES</span></div>
          <button className="add-files" onClick={() => input.current?.click()} disabled={!!busy}><Plus size={17} />添加 PDF</button>
          <div className="sources-list">
            {sources.map(source => <SourceRow key={source.id} source={source} retained={sourceCounts.get(source.id) ?? 0} busy={!!busy}
              move={moveSource} remove={removeSource} />)}
            {!sources.length && <div className="sidebar-empty"><Files size={29} /><p>你的文件将显示在这里</p><small>支持一次添加多个 PDF</small></div>}
          </div>
          <div className="sidebar-tip"><GripVertical size={16} /><p>拖动文件手柄到页面区，<br />移动整份文件的保留页面。</p></div>
          <div className="draft-controls"><label><input type="checkbox" checked={storage.enabled} disabled={!!busy||!!storage.pending} onChange={e=>{if(e.target.checked)storage.setEnabled(true);else if(window.confirm('关闭本机保存并删除已有缓存？当前会话草稿仍保留。'))void storage.disable();}}/>保存在此浏览器</label><p role="status">{storage.status||'开启后保存原 PDF、排列和校对草稿。'}</p>{storage.enabled&&<button disabled={!!busy} onClick={()=>void storage.saveNow()}>立即保存</button>}<button disabled={!!busy} onClick={()=>void clearWorkspace()}>清空工作区及缓存</button></div>
          <div className="local-card"><span><HardDrive size={17} />本地处理</span><p>无需上传，无需登录。<br />原始文件始终保持不变。</p></div>
        </aside>

        <main className="main-workspace">
          <div className="workspace-heading"><div><div className="eyebrow">YOUR PDF, IN ORDER</div><h1>把每一页，放在对的位置。</h1><p>合并、排序、提取或拆分，在一个工作台里完成。</p></div>
            <div className="history-actions"><button className="icon-button" disabled={!history.past.length || !!busy} onClick={() => dispatch({ type: 'undo' })} aria-label="撤销" title="撤销 ⌘/Ctrl Z"><Undo2 size={19} /></button><button className="icon-button" disabled={!history.future.length || !!busy} onClick={() => dispatch({ type: 'redo' })} aria-label="重做" title="重做 ⌘/Ctrl Shift Z"><Redo2 size={19} /></button></div>
          </div>

          <section className="toolbar" aria-label="页面整理工具栏">
            <div className="toolbar-left"><label className="select-all"><input type="checkbox" checked={!!pages.length && selectedPages.length === pages.length} disabled={!pages.length || !!busy} onChange={() => setSelected(selectedPages.length === pages.length ? new Set() : new Set(pages.map(page => page.id)))} />全选</label><span className="toolbar-separator" />
              <form className="range-form" onSubmit={event => { event.preventDefault(); selectRange(); }}><input aria-label="页码范围" placeholder="页码范围，如 1-3,5" value={range} onChange={event => { setRange(event.target.value); setRangeError(''); }} disabled={!pages.length || !!busy} /><button disabled={!pages.length || !!busy || !range.trim()}>选择</button></form>
            </div>
            <div className="toolbar-actions"><button disabled={!isSelected || !!busy} onClick={() => commit(snapshot => ({ ...snapshot, pages: snapshot.pages.map(page => selected.has(page.id) ? { ...page, rotation: (page.rotation + 90) % 360 } : page) }))}><RotateCw size={16} /><span>旋转</span></button><button disabled={!isSelected || !!busy} onClick={() => move(selectionIds, 0)} title="将选中页面移至开头"><ArrowUpToLine size={16} /><span>开头</span></button><button disabled={!isSelected || !!busy} onClick={() => move(selectionIds, pages.length)} title="将选中页面移至末尾"><ArrowDownToLine size={16} /><span>末尾</span></button><button className="delete-button" disabled={!isSelected || !!busy} onClick={() => commit(snapshot => ({ ...snapshot, pages: snapshot.pages.filter(page => !selected.has(page.id)) }))}><Trash2 size={16} /><span>删除</span></button></div>
          </section>
          {storage.pending&&<div className="restore-banner" role="status"><span>发现本机草稿：{storage.pending.workspace.sources.length} 个文件，{storage.pending.workspace.pages.length} 页。保存于 {new Date(storage.pending.savedAt).toLocaleString()}</span><button disabled={!!busy} onClick={()=>void restoreDraft()}>恢复草稿</button><button disabled={!!busy} onClick={()=>void storage.disable()}>删除草稿</button></div>}
          {rangeError && <p className="inline-error" role="alert">{rangeError}</p>}
          {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.kind === 'success' && <Check size={17} />}{notice.text}</span>{notice.retry && <button className="recovery-button" disabled={!!busy} onClick={() => void recover()}>重试恢复</button>}<button aria-label="关闭提示" onClick={() => setNotice(null)}><X size={16} /></button></div>}
          {download && <div className="download-result"><Download size={14} /><a href={download.url} download={download.name}>下载 {download.name}</a><span>已生成，可下载</span></div>}
          {word.download && <div className="download-result"><FileText size={14} /><a href={word.download.url} download={word.download.name}>下载 {word.download.kind==='word'?'Word':'可搜索 PDF'}：{word.download.name}</a><span>已生成，可下载</span></div>}
          {busy && <div className="processing" role="status"><LoaderCircle size={17} className="spin" /><span>{busy}</span>{progress !== null && <><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><small>{progress}%</small></>}<button className="cancel-task" disabled={cancelling} onClick={cancel}>取消处理</button></div>}

          <div className="page-section-heading"><div><h2>页面整理区</h2><span>{pages.length} 页{selectedPages.length > 0 && <b> · 已选 {selectedPages.length} 页</b>}</span></div><span className="grid-tip">{isSelected ? <button onClick={() => setSelected(new Set())} disabled={!!busy}>取消选择</button> : '拖动手柄排序 · Shift 连选'}</span></div>
          {!pages.length ? <section className="empty-workspace">
            <div className="empty-art"><span className="paper paper-back"><FileText size={36} /></span><span className="paper paper-front"><FileText size={40} /><i>PDF</i></span><span className="art-plus"><Plus size={18} /></span></div>
            <h2>{sources.length ? '页面已清空' : '从你的 PDF 开始'}</h2><p>{sources.length ? '可以撤销删除，或添加新的文件继续整理。' : '把文件拖到这里，或选择两个及以上 PDF。'}<br />{sources.length ? '来源文件仍保留在左侧。' : '按你想要的顺序，组合成一份新文档。'}</p>
            <button className="primary-button" onClick={() => input.current?.click()} disabled={!!busy}><Upload size={17} />选择 PDF 文件</button><span className="empty-footnote"><LockKeyhole size={13} />文件无需上传，直接在浏览器中处理</span>
            <div className="steps"><span><i>01</i>添加文件</span><span className="step-line" /><span><i>02</i>整理页面</span><span className="step-line" /><span><i>03</i>导出 PDF</span></div>
          </section> : <div className="page-grid" aria-label="PDF 页面列表">
            {pages.map((page, index) => <PageCard key={page.id} page={page} source={sourcesById.get(page.sourceId)!} index={index} selected={selected.has(page.id)} busy={!!busy} insertBefore={!!drag && insertion === index} insertAfter={!!drag && insertion === index + 1} select={selectPage} preview={setPreviewId} move={movePage} />)}
            <EndZone index={pages.length} active={!!drag} insertion={insertion} busy={!!busy} add={() => input.current?.click()} />
          </div>}

          <footer className="export-bar"><div className="export-summary"><span className="summary-icon"><Layers3 size={20} /></span><div><strong>{pages.length ? `${pages.length} 页，准备就绪` : '等待添加文件'}</strong><small>{sources.length ? `${sources.length} 个来源文件 · ${fileSize(totalSize)}` : '按当前页面顺序生成新文档'}</small></div></div>
            <div className="export-buttons"><button className="secondary-button" disabled={!pages.length||!!busy} onClick={()=>word.open('searchable')}><ScanText size={16}/>可搜索 PDF</button><button className="secondary-button" disabled={!pages.length || !!busy} onClick={()=>word.open('word')}><FileText size={16} />转 Word</button><button className="secondary-button" disabled={!pages.length || !!busy} onClick={() => openExport('split')}><Scissors size={16} />按范围拆分</button><button className="secondary-button" disabled={!isSelected || !!busy} onClick={() => openExport('selection')} title={!isSelected ? '请先选中需要另存的页面' : undefined}><FilePlus2 size={16} />选中另存{isSelected && <span className="count-badge">{selectedPages.length}</span>}</button><button className="primary-button" disabled={!pages.length || !!busy} onClick={() => openExport('all')}><Download size={17} />导出全部</button></div>
          </footer>
          <div className="workspace-footnote"><ShieldCheck size={12} />支持普通 PDF · 暂不支持加密文件 · 请导出结果或开启本机保存</div>
        </main>
      </div>
      <DragOverlay dropAnimation={null}>{drag && <div className="drag-overlay"><Layers3 size={20} /><span>{drag.label}</span><b>{drag.ids.size} 页</b></div>}</DragOverlay>
    </DndContext>

    {externalDrag && <div className="external-drop"><Upload size={45} /><h2>松开，添加 PDF</h2><p>新文件将接在当前页面之后</p></div>}

    {previewPage && <Modal title={`第 ${previewIndex + 1} 页`} subtitle={`${sourcesById.get(previewPage.sourceId)!.name} · 原第 ${previewPage.pageIndex + 1} 页`} onClose={() => setPreviewId(null)} wide>
      <div className="preview-document"><PdfCanvas page={previewPage} large /></div><div className="preview-navigation"><button className="secondary-button" disabled={previewIndex <= 0} onClick={() => setPreviewId(pages[previewIndex - 1].id)}><ChevronLeft size={17} />上一页</button><span>{previewIndex + 1} / {pages.length}</span><button className="secondary-button" disabled={previewIndex >= pages.length - 1} onClick={() => setPreviewId(pages[previewIndex + 1].id)}>下一页<ChevronRight size={17} /></button></div>
    </Modal>}

    {exportMode && <Modal title={exportMode === 'split' ? '按范围拆分' : exportMode === 'selection' ? '选中页面另存' : '导出全部页面'} subtitle={exportMode === 'split' ? '每个范围生成一个 PDF，打包为 ZIP 下载。' : `按当前排列导出 ${exportMode === 'all' ? pages.length : selectedPages.length} 页，保留原始页面尺寸。`} onClose={() => setExportMode(null)} busy={!!busy}>
      <label className="field-label" htmlFor="output-name">{exportMode === 'split' ? '文件名前缀' : '输出文件名'}</label><div className="filename-field"><input id="output-name" value={outputName} onChange={event => setOutputName(event.target.value)} disabled={!!busy} maxLength={150} /><span>{exportMode === 'split' ? '.zip' : '.pdf'}</span></div>
      {exportMode === 'split' && <div className="split-editor"><div className="split-title"><strong>拆分范围</strong><span>使用当前页码，共 {pages.length} 页</span></div>
        <div className="split-rows">{splitRows.map((row, index) => <div className="split-row" key={index}><span>{String(index + 1).padStart(2, '0')}</span><input aria-label={`第 ${index + 1} 段范围`} placeholder={index === 0 ? '例如 1-3' : '例如 4-6 或 8'} value={row} onChange={event => setSplitRows(current => current.map((value, i) => i === index ? event.target.value : value))} disabled={!!busy} /><button className="icon-button" disabled={splitRows.length === 1 || !!busy} aria-label={`删除第 ${index + 1} 段`} onClick={() => setSplitRows(current => current.filter((_, i) => i !== index))}><X size={17} /></button></div>)}</div>
        <button className="text-button" onClick={() => setSplitRows(current => [...current, ''])} disabled={!!busy}><Plus size={16} />添加范围</button>
        {splitError ? <p className="inline-error" role="status">{splitError}</p> : <div className="split-success"><Check size={16} />将生成 {splitRows.length} 个 PDF，未包含 {splitResult!.omitted} 页。</div>}
      </div>}
      <div className="export-note"><ShieldCheck size={17} /><p>全部在本地生成，不会修改原文件。<br />书签、交互表单和数字签名不保证保留。</p></div>
      {busy && <div className="processing"><LoaderCircle size={17} className="spin" /><span>{busy}</span></div>}
      {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}><span>{notice.text}</span>{notice.retry && <button className="recovery-button" disabled={!!busy} onClick={() => void recover()}>重试恢复</button>}</div>}
      <div className="modal-footer"><button className="secondary-button" onClick={busy ? cancel : () => setExportMode(null)} disabled={cancelling}>{busy ? '取消处理' : '取消'}</button><button className="primary-button" disabled={!!busy || !outputName.trim() || (exportMode === 'split' && !splitResult) || (exportMode === 'selection' && !isSelected) || !pages.length} onClick={() => void exportPdf()}>{busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}{exportMode === 'split' ? '生成并下载 ZIP' : '生成并下载 PDF'}</button></div>
    </Modal>}

    <WordModal word={word} task={task} />

    {help && <Modal title="让 PDF 整理更简单" subtitle="文件只在当前浏览器内处理，可选择保存到本机。" onClose={() => setHelp(false)}>
      <div className="help-content"><p><strong>添加与预览</strong>拖入 PDF 或点击“添加 PDF”。点击页面放大预览；页面下方标注来源文件和原始页码。</p><p><strong>选择页面</strong>勾选页面，Shift 点击连续选择，或输入 <code>1-3,5,8-10</code>。范围使用当前排列中的页码。</p><p><strong>移动页面</strong>拖动页面右上角的手柄。选中的页面会一起移动；拖动未选中页面只移动该页。也可以使用移至开头／末尾按钮。</p><p><strong>移动整份文件</strong>拖动左侧文件手柄到页面区。该文件所有保留页面会按当前顺序重新聚拢。</p><p><strong>撤销与导出</strong>支持 ⌘/Ctrl Z 撤销、⌘/Ctrl Shift Z 重做。选页另存和拆分不会移除页面；请在刷新或关闭前导出，或开启本机保存。</p><p><strong>PDF 转 Word</strong>先检查当前全部或选中页面。无文字页可运行中英文 OCR，核对或修改识别结果后生成可编辑 Word；仍无文字的页面需确认跳过。不还原图片和表格版式。</p><p><strong>保存与恢复</strong>开启“保存在此浏览器”后，保存原 PDF、排列及文字草稿。刷新后可恢复；未完成的 OCR 需手动继续。关闭保存会删除本机缓存，清空工作区也会删除缓存。</p><p><strong>可搜索 PDF</strong>检查并核对 OCR 文字后，保留原页外观并添加不可见文字层。已有文字层继续保留，不支持替换原文字层；确认无文字页后保留原页。</p><p className="help-boundary">当前支持普通 PDF，加密文件暂不支持。不保证保留书签、交互表单和数字签名。大文件的承载能力取决于设备内存。</p></div>
    </Modal>}
  </div>;
}
