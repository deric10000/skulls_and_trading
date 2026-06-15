import type { ButtonHTMLAttributes, ReactNode } from "react";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  fullWidth?: boolean;
  children: ReactNode;
}

export function AuthButton({
  variant = "primary",
  fullWidth = true,
  className = "",
  children,
  type = "button",
  ...rest
}: AuthButtonProps) {
  const classes = [
    "btn",
    variant === "primary" ? "btn--primary" : "btn--ghost",
    fullWidth ? "btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // eslint-disable-next-line react/button-has-type
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
