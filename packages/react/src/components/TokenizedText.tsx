import { useRef } from 'react';
import type { HTMLAttributes, ElementType, ReactNode, CSSProperties } from 'react';
import { useToken } from '../hooks.js';

interface TokenizedTextProps extends Omit<HTMLAttributes<HTMLElement>, 'color'> {
  token: string;
  as?: ElementType;
  children?: ReactNode;
}

export function TokenizedText({ token, as: Tag = 'span', style, children, ...rest }: TokenizedTextProps) {
  const ref = useRef<HTMLElement>(null);
  const hex = useToken(token, ref);
  const mergedStyle: CSSProperties = { color: hex, ...style };
  return (
    <Tag ref={ref} style={mergedStyle} {...rest}>
      {children}
    </Tag>
  );
}
