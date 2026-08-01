import type { ReactNode } from "react";

export type RowMessageTone = "error" | "warning";

/** Quiet inline validation copy that expands its owning row. */
export function RowMessage({
  tone,
  children,
  className,
}: {
  tone: RowMessageTone;
  children: ReactNode;
  className?: string;
}) {
  const classes = ["row-message", `row-message--${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <p className={classes} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
