import 'fake-indexeddb/auto';
import { describe,it,expect } from 'vitest';
import { deleteSavedWorkspace,readSavedWorkspace,writeSavedWorkspace } from './draft-storage';
import { interruptedDrafts,newDraft } from './text-drafts';
it('round-trips original blobs, stable IDs, order, rotations, edits and confirmation',async()=> {
  await deleteSavedWorkspace();expect(await readSavedWorkspace()).toBeUndefined();
  const info={id:'p',sourceId:'s',sourceName:'中文.pdf',pageIndex:0,currentPage:1};
  await writeSavedWorkspace({version:1,savedAt:1,workspace:{sources:[{id:'s',name:'中文.pdf',pageCount:1,size:3,color:0}],pages:[{id:'p',sourceId:'s',pageIndex:0,rotation:90}]},files:{s:new Blob(['PDF'])},text:{p:{...newDraft(info),checkStatus:'empty',ocrStatus:'processing',reviewed:true,recognized:{...info,lines:['已修改']}}},generatedKey:null});
  const saved=(await readSavedWorkspace())!;expect(await saved.files.s.text()).toBe('PDF');expect(saved.workspace.pages[0].rotation).toBe(90);expect(saved.text.p.recognized?.lines).toEqual(['已修改']);
  const resumed=interruptedDrafts(saved.text);expect(resumed.p.ocrStatus).toBe('pending');expect(resumed.p.reviewed).toBe(true);
  await deleteSavedWorkspace();expect(await readSavedWorkspace()).toBeUndefined();
});
describe('storage errors',()=>{it('reports unavailable IndexedDB without replacing session state',async()=>{const original=globalThis.indexedDB;Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:undefined});try{await expect(readSavedWorkspace()).rejects.toThrow();}finally{Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:original});}});});
