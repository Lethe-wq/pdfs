// Node adapter for exercising the exact Worker bundle produced by Vite.
import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = globalThis;
self.postMessage = (message, transfer = []) => parentPort.postMessage(message, transfer);
const queue = [];
parentPort.on('message', data => {
  if ((workerData.failExport && data.kind === 'export') || workerData.failKind === data.kind) throw new Error('Injected worker failure');
  if (self.onmessage) void self.onmessage({ data });
  else queue.push(data);
});
await import(workerData.entry);
for (const data of queue) {
  if ((workerData.failExport && data.kind === 'export') || workerData.failKind === data.kind) throw new Error('Injected worker failure');
  void self.onmessage({ data });
}
