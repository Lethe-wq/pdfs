import { memo, useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import type { PageItem } from './model';
import { getPreview, renderSlot } from './preview';
import { FileWarning, LoaderCircle } from 'lucide-react';
import { observeVisibility } from './visibility';

function PdfCanvas({ page, large = false }: { page: PageItem; large?: boolean }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(large);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (large) return;
    if (wrapper.current) return observeVisibility(wrapper.current, setVisible);
  }, [large]);

  useEffect(() => {
    if (!visible) {
      if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; }
      setStatus('loading');
      return;
    }
    let cancelled = false;
    let task: RenderTask | undefined;
    setStatus('loading');
    void renderSlot(async () => {
      if (cancelled || !canvas.current) return;
      const doc = await getPreview(page.sourceId);
      const pdfPage = await doc.getPage(page.pageIndex + 1);
      if (cancelled || !canvas.current) return;
      const rotation = (pdfPage.rotate + page.rotation) % 360;
      const natural = pdfPage.getViewport({ scale: 1, rotation });
      const ratio = Math.min(window.devicePixelRatio || 1, large ? 1.5 : 2);
      const scale = Math.min((large ? 780 : 190) / natural.width, (large ? 1040 : 248) / natural.height) * ratio;
      const viewport = pdfPage.getViewport({ scale, rotation });
      // A detached canvas prevents cancelled renders racing a new render on the same canvas.
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.ceil(viewport.width);
      offscreen.height = Math.ceil(viewport.height);
      task = pdfPage.render({ canvas: offscreen, viewport });
      await task.promise;
      if (cancelled || !canvas.current) return;
      const target = canvas.current;
      target.width = offscreen.width;
      target.height = offscreen.height;
      target.style.width = `${offscreen.width / ratio}px`;
      target.style.height = `${offscreen.height / ratio}px`;
      target.getContext('2d')!.drawImage(offscreen, 0, 0);
      setStatus('ready');
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, page.sourceId, page.pageIndex, page.rotation, large]);

  return <div ref={wrapper} className={`pdf-canvas ${large ? 'large' : ''}`}>
    <canvas ref={canvas} style={{ opacity: status === 'ready' ? 1 : 0 }} />
    {status === 'loading' && <span className="canvas-status"><LoaderCircle size={19} className="spin" /><span>加载预览</span></span>}
    {status === 'error' && <span className="canvas-status"><FileWarning size={24} /><span>此页预览失败</span><small>仍可尝试导出</small></span>}
  </div>;
}
export default memo(PdfCanvas);
