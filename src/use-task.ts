import { useCallback, useEffect, useRef, useState } from 'react';

interface TaskState { label: string; progress: number | null; cancelling: boolean }
export function useTask() {
  const [state, setState] = useState<TaskState | null>(null);
  const active = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  useEffect(() => () => active.current?.abort(), []);
  const begin = useCallback((label: string) => {
    if (active.current) return null;
    const controller = new AbortController();
    active.current = controller;
    busyRef.current = true;
    setState({ label, progress: null, cancelling: false });
    return controller;
  }, []);
  const update = useCallback((controller: AbortController, label: string, progress: number | null = null) => {
    if (active.current === controller && !controller.signal.aborted) setState({ label, progress, cancelling: false });
  }, []);
  const finish = useCallback((controller: AbortController) => {
    if (active.current !== controller) return;
    active.current = null;
    busyRef.current = false;
    setState(null);
  }, []);
  const cancel = useCallback(() => {
    if (!active.current) return;
    setState(current => current && { ...current, label: '正在取消…', cancelling: true });
    active.current.abort();
  }, []);
  return { busy: state?.label ?? '', progress: state?.progress ?? null, cancelling: state?.cancelling ?? false, busyRef, begin, update, finish, cancel };
}
export type Task = ReturnType<typeof useTask>;
