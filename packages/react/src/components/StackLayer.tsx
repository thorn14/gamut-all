import type { HTMLAttributes, ElementType, ReactNode } from 'react';
import type { StackClass } from '@gamut-all/core';

interface StackLayerProps extends HTMLAttributes<HTMLElement> {
  stack: StackClass;
  bg?: string;
  as?: ElementType;
  children?: ReactNode;
}

export function StackLayer({ stack, bg, as: Tag = 'div', children, ...rest }: StackLayerProps) {
  return (
    <Tag data-stack={stack} data-theme={bg} {...rest}>
      {children}
    </Tag>
  );
}
