import type { Snapshot } from './model';
import type { TextDrafts } from './text-drafts';
export interface SavedWorkspace { version:1; savedAt:number; workspace:Snapshot; files:Record<string,Blob>; text:TextDrafts; generatedKey:string|null }
const DB='pdf-workspace-drafts';
export function openDraftDb():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=> {
    let blocked=false;
    const request=indexedDB.open(DB,2);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('workspace'))request.result.createObjectStore('workspace');if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files');};
    request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
    request.onerror=()=>reject(request.error??new Error('无法打开本机存储。'));
    request.onblocked=()=>{blocked=true;reject(new Error('本机存储被其他页面占用，请关闭其他工作台页面。'));};
  });
}
export async function readSavedWorkspace():Promise<SavedWorkspace|undefined> {
  const db=await openDraftDb();
  try {return await new Promise((resolve,reject)=> {
    const tx=db.transaction(['workspace','files'],'readonly');let result:SavedWorkspace|undefined;
    const request=tx.objectStore('workspace').get('current');
    request.onsuccess=()=>{
      result=request.result;
      if(result&&result.version!==1){reject(new Error('草稿版本不受支持，请删除旧草稿后重新导入。'));return;}
      if(result){result.files={...result.files};for(const source of result.workspace.sources){const file=tx.objectStore('files').get(source.id);file.onsuccess=()=>{if(file.result)result!.files[source.id]=file.result;};}}
    };
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error??request.error);tx.onabort=()=>reject(tx.error??new Error('读取草稿中断。'));
  });}finally{db.close();}
}
export async function writeSavedWorkspace(saved:SavedWorkspace) {
  if(saved.workspace.sources.some(source=>!saved.files[source.id]))throw new Error('原 PDF 暂时不可用，草稿未写入。');
  const db=await openDraftDb();
  try {await new Promise<void>((resolve,reject)=> {
    const tx=db.transaction(['workspace','files'],'readwrite'),files=tx.objectStore('files');
    const ids=new Set(saved.workspace.sources.map(source=>source.id));
    for(const id of ids){const exists=files.getKey(id);exists.onsuccess=()=>{if(exists.result===undefined)files.put(saved.files[id],id);};}
    const cursor=files.openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){if(!ids.has(String(item.key)))item.delete();item.continue();}};
    // Large source blobs are immutable and stored once. Page updates only replace this metadata record.
    tx.objectStore('workspace').put({...saved,files:{}},'current');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('保存失败。'));tx.onabort=()=>reject(tx.error??new Error('保存已中断。'));
  });}finally{db.close();}
}
export async function deleteSavedWorkspace() {
  const db=await openDraftDb();
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['workspace','files'],'readwrite');tx.objectStore('workspace').clear();tx.objectStore('files').clear();
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('删除失败。'));tx.onabort=()=>reject(tx.error??new Error('删除已中断。'));
  });}finally{db.close();}
}
