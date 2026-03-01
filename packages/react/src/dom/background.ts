export function readTheme(el: Element): string | null {
  let current: Element | null = el;
  while (current) {
    const theme = current.getAttribute('data-theme');
    if (theme) return theme;
    current = current.parentElement;
  }
  return null;
}
