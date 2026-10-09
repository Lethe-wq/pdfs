let observer: IntersectionObserver | undefined;
const callbacks = new Map<Element, (visible: boolean) => void>();
export function observeVisibility(element: Element, callback: (visible: boolean) => void) {
  if (!observer) observer = new IntersectionObserver(entries => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
  }, { rootMargin: '240px' });
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
    if (!callbacks.size) { observer?.disconnect(); observer = undefined; }
  };
}
