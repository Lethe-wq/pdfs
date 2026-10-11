import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement } from 'react';
import { useTask } from './use-task';
import { useWordExport } from './use-word-export';
import type { PageItem } from './model';
const mock=vi.hoisted(()=>({text:vi.fn(),recognize:vi.fn(),generate:vi.fn(),searchable:vi.fn()}));
vi.mock('./preview',()=>({getPreview:async()=>({getPage:async()=>({})})}));
vi.mock('./pdf-text',()=>({readPageText:mock.text}));
vi.mock('./ocr-render',()=>({renderOcrRaster:async()=>({image:new ArrayBuffer(1),geometry:{width:100,height:100,transform:[1,0,0,-1,0,100]}})}));
vi.mock('./ocr-client',()=>({OcrClient:class {recognize=mock.recognize;dispose(){}}}));
vi.mock('./word-client',()=>({WordClient:class {generate=mock.generate;dispose(){}}}));
vi.mock('./pdf-client',()=>({pdfClient:{searchable:mock.searchable}}));
let api:ReturnType<typeof useWordExport>,task:ReturnType<typeof useTask>,renderer:ReactTestRenderer;
const pages:PageItem[]=[{id:'a',sourceId:'s',pageIndex:0,rotation:0},{id:'b',sourceId:'s',pageIndex:1,rotation:0}];
const result={text:'中文 ABC',confidence:88,lines:[{text:'中文 ABC',confidence:88,bbox:{x0:10,y0:10,x1:90,y1:20},paragraph:0,words:[]}],rotateRadians:0};
function Harness({input=pages}:{input?:PageItem[]}) {task=useTask();api=useWordExport(task,input,input.slice(0,1),new Map([['s',{id:'s',name:'test.pdf',pageCount:2,size:1,color:0}]]),()=>{},()=>{});return null;}
beforeEach(async()=> {
  vi.clearAllMocks();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('window',{location:{href:'http://localhost/'},confirm:()=>true});
  mock.text.mockResolvedValue([]);mock.recognize.mockResolvedValue(result);
  await act(async()=>{renderer=create(createElement(Harness));});
});
describe('text workflow lifecycle',()=> {
  it('retains corrections and review when closing, reopening and changing scope',async()=> {
    await act(async()=>api.open());await act(async()=>api.check());await act(async()=>api.runOcr());
    await act(async()=>api.updateLine('a','a:ocr:0',{text:'修改后的中文'}));await act(async()=>api.review('a',true));
    await act(async()=>api.close());await act(async()=>api.open());await act(async()=>api.setScope('selection'));
    expect(api.targetDrafts[0].recognized?.lines).toEqual(['修改后的中文']);expect(api.targetDrafts[0].reviewed).toBe(true);expect(api.canGenerate).toBe(true);
    await act(async()=>renderer.unmount());
  });
  it('keeps successful pages when another fails and retries only failed pages',async()=> {
    mock.recognize.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('failed'));
    await act(async()=>api.open());await act(async()=>api.check());await act(async()=>api.runOcr());
    expect(api.drafts.a.ocrStatus).toBe('success');expect(api.drafts.b.ocrStatus).toBe('failed');
    await act(async()=>api.runOcr());expect(mock.recognize).toHaveBeenCalledTimes(3);expect(api.drafts.b.ocrStatus).toBe('success');
    await act(async()=>renderer.unmount());
  });
  it('commits earlier pages on cancel and ignores late results',async()=> {
    let resolve!:(value:typeof result)=>void;
    mock.recognize.mockResolvedValueOnce(result).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
    await act(async()=>api.open());await act(async()=>api.check());
    let pending!:Promise<void>;await act(async()=>{pending=api.runOcr();await new Promise(r=>setTimeout(r,0));});
    await act(async()=>{task.cancel();resolve(result);await pending;});
    expect(api.drafts.a.ocrStatus).toBe('success');expect(api.drafts.b.ocrStatus).toBe('pending');expect(api.drafts.b.recognized).toBeUndefined();
    await act(async()=>renderer.unmount());
  });
  it('remaps current numbering on reorder, excludes deleted pages and reuses undo results',async()=> {
    await act(async()=>api.open());await act(async()=>api.check());await act(async()=>api.runOcr());await act(async()=>api.close());
    await act(async()=>renderer.update(createElement(Harness,{input:[pages[1]]})));await act(async()=>api.open());
    expect(api.targetDrafts).toHaveLength(1);expect(api.targetDrafts[0].info.currentPage).toBe(1);expect(api.drafts.a.recognized).toBeDefined();
    await act(async()=>api.close());await act(async()=>renderer.update(createElement(Harness,{input:[pages[1],pages[0]]})));await act(async()=>api.open());
    expect(api.targetDrafts[1].info.currentPage).toBe(2);expect(api.targetDrafts[1].recognized).toBeDefined();await act(async()=>renderer.unmount());
  });
  it('allows confirmed blank pages in searchable PDF, but not empty Word',async()=> {
    await act(async()=>api.open('searchable'));await act(async()=>api.check());
    expect(api.canGenerate).toBe(false);await act(async()=>{api.exclude('a',true);api.exclude('b',true);});expect(api.canGenerate).toBe(true);
    await act(async()=>api.close());await act(async()=>api.open('word'));expect(api.canGenerate).toBe(false);
    await act(async()=>api.setOutputName(''));expect(api.canGenerate).toBe(false);await act(async()=>renderer.unmount());
  });
});
