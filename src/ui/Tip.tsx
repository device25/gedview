import type {ReactElement} from 'react';
import {
  OverlayArrow,
  Tooltip,
  TooltipTrigger,
  type Placement,
} from 'react-aria-components';
import './tip.css';

interface TipProps {
  /** Same text as the trigger's accessible name. */
  label: string;
  /** Optional second line, e.g. why the control is unavailable. */
  hint?: string;
  /** Keyboard shortcut shown next to the label. */
  shortcut?: string;
  placement?: Placement;
  /** A react-aria Button (it must forward hover and focus events). */
  children: ReactElement;
}

/**
 * Tooltip for icon-only controls: shows on hover after a short delay and on
 * keyboard focus, closes on Esc, and is never needed on touch screens where
 * the controls have visible labels.
 */
export function Tip({
  label,
  hint,
  shortcut,
  placement = 'right',
  children,
}: TipProps) {
  return (
    <TooltipTrigger delay={500} closeDelay={100}>
      {children}
      <Tooltip className="tip" placement={placement} offset={10}>
        <OverlayArrow className="tip__arrow">
          <svg width={8} height={8} viewBox="0 0 8 8" aria-hidden="true">
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        </OverlayArrow>
        <span className="tip__label">
          {label}
          {shortcut && <kbd className="tip__kbd">{shortcut}</kbd>}
        </span>
        {hint && <span className="tip__hint">{hint}</span>}
      </Tooltip>
    </TooltipTrigger>
  );
}
