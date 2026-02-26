import type { StackClass } from '@gamut-all/core';

export function readStack(el: Element): StackClass {
  let current: Element | null = el;
  while (current) {
    const stack = current.getAttribute('data-stack');
    if (stack) return stack as StackClass;
    current = current.parentElement;
  }
  return 'root';
}
