import 'fake-indexeddb/auto';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {createElement} from 'react';
import {describe,it,expect,vi} from 'vitest';
import {useDraftStorage} from './use-draft-storage';
import {readSavedWorkspace,deleteSavedWorkspace} from './draft-storage';
import {newDraft} from './text-drafts';
vi.mock('./pdf-client',()=>({pdfClient:{sourceFiles:()=>({s:new Blob(['PDF'])})}}));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const workspace={sources:[{id:'s',name:'PDF',pageCount:1,size:3,color:0}],pages:[{id:'p',sourceId:'s',pageIndex:0,rotation:0}]};
const info={id:'p',sourceId:'s',sourceName:'PDF',pageIndex:0,currentPage:1};
let api:ReturnType<typeof useDraftStorage>;
const emptyText={};
function Harness({text=emptyText}:{text?:Record<string,ReturnType<typeof newDraft>>}) {api=useDraftStorage(workspace,text,null);return null;}
describe('draft save scheduling',()=>{
 it('saves completed pages, debounces edits, and deletes after pending writes',async()=>{
  await deleteSavedWorkspace();let renderer!:ReactTestRenderer;
  await act(async()=>{renderer=create(createElement(Harness));});
  await act(async()=>api.setEnabled(true));await act(async()=>new Promise(r=>setTimeout(r,350)));
  expect((await readSavedWorkspace())?.workspace.pages[0].id).toBe('p');
  const ready={...newDraft(info),checkStatus:'empty' as const,ocrStatus:'success' as const,recognized:{...info,lines:['first']}};
  await act(async()=>renderer.update(createElement(Harness,{text:{p:ready}})));await act(async()=>new Promise(r=>setTimeout(r,350)));
  expect((await readSavedWorkspace())?.text.p.recognized?.lines).toEqual(['first']);
  await act(async()=>renderer.update(createElement(Harness,{text:{p:{...ready,recognized:{...info,lines:['edited']}}}})));
  expect(api.unsaved).toBe(true);await act(async()=>api.saveNow());expect((await readSavedWorkspace())?.text.p.recognized?.lines).toEqual(['edited']);
  await act(async()=>api.disable());expect(await readSavedWorkspace()).toBeUndefined();expect(api.enabled).toBe(false);await act(async()=>renderer.unmount());
 });
});
