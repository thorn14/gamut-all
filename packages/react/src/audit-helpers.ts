export function warnMissingDataBg(el: Element): void {
  let current: Element | null = el;
  while (current) {
    if (current.getAttribute('data-bg')) return;
    current = current.parentElement;
  }
  console.warn(
    `[gamut-all] Element has no data-bg attribute in its ancestor chain:`,
    el,
  );
}

export function checkDataBgCoverage(root: Element): { missing: Element[]; present: Element[] } {
  const all = Array.from(root.querySelectorAll('*'));
  const missing: Element[] = [];
  const present: Element[] = [];

  for (const el of all) {
    if (el.getAttribute('data-bg')) {
      present.push(el);
    } else {
      let ancestor: Element | null = el.parentElement;
      let found = false;
      while (ancestor) {
        if (ancestor.getAttribute('data-bg')) { found = true; break; }
        ancestor = ancestor.parentElement;
      }
      if (!found) missing.push(el);
    }
  }

  return { missing, present };
}
