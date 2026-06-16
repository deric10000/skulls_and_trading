import type { ButtonHTMLAttributes, ReactNode } from "react";

interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function LinkButton({
  className = "",
  children,
  type = "button",
  ...rest
}: LinkButtonProps) {
  const classes = ["btn", "btn--link", className].filter(Boolean).join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
