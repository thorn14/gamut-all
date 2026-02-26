export function readBg(el: Element): string | null {
  let current: Element | null = el;
  while (current) {
    const bg = current.getAttribute('data-bg');
    if (bg) return bg;
    current = current.parentElement;
  }
  return null;
}
