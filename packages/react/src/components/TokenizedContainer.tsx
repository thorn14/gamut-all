import type { HTMLAttributes, ElementType, ReactNode } from 'react';
import type { StackClass } from '@gamut-all/core';
import { StackLayer } from './StackLayer.js';

interface TokenizedContainerProps extends HTMLAttributes<HTMLElement> {
  bg: string;
  stack?: StackClass;
  as?: ElementType;
  children?: ReactNode;
}

export function TokenizedContainer({
  bg,
  stack = 'root',
  as,
  children,
  ...rest
}: TokenizedContainerProps) {
  return (
    <StackLayer stack={stack} bg={bg} as={as} {...rest}>
      {children}
    </StackLayer>
  );
}
