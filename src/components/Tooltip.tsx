import { useId, type ReactNode } from "react";
import { Info } from "../lib/icons";

/**
 * Design-system tooltip (per the Figma tooltip pattern): a dark rounded
 * popover with an optional bold title and body copy. Shows on hover and on
 * keyboard focus; the content is wired via `aria-describedby` so screen
 * readers announce it too.
 *
 * `Tooltip` wraps any trigger; `InfoTip` is the common info-icon trigger used
 * beside section labels on the Configure card.
 */
export function Tooltip({
  title,
  body,
  children,
  wide,
}: {
  title?: string;
  body: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <span className="tooltip-wrap" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={wide ? "tooltip tooltip--wide" : "tooltip"}
      >
        {title ? <span className="tooltip-title">{title}</span> : null}
        <span className="tooltip-body">{body}</span>
      </span>
    </span>
  );
}

/** Info-icon tooltip trigger (the ⓘ beside labels on the Configure card). */
export function InfoTip({
  label,
  title,
  body,
  wide,
}: {
  /** Accessible name for the icon button, e.g. "About thesis tags". */
  label: string;
  title?: string;
  body: ReactNode;
  wide?: boolean;
}) {
  return (
    <Tooltip title={title} body={body} wide={wide}>
      <button type="button" className="info-tip" aria-label={label}>
        <Info aria-hidden weight="regular" />
      </button>
    </Tooltip>
  );
}
