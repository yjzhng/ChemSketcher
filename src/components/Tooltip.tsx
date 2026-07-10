import { useEffect, useRef, type ReactNode } from 'react';
import { hideTip, showTip } from '../ui/tooltip';

/**
 * Fast, viewport-aware tooltip for our own controls. Replaces the native
 * `title` attribute (which has a long, non-configurable browser delay).
 * Positioning + edge-clamping live in the shared controller (../ui/tooltip).
 */
export default function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => () => hideTip(), []);

  return (
    <span
      ref={ref}
      className="tip-wrap"
      onMouseEnter={() => ref.current && showTip(ref.current, label)}
      onMouseLeave={hideTip}
      onMouseDown={hideTip}
    >
      {children}
    </span>
  );
}
