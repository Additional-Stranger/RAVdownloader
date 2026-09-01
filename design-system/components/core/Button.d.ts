import * as React from "react";

/**
 * Primary action control.
 * @startingPoint section="Core" subtitle="Buttons, icon buttons and status chips" viewport="700x220"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = one per view. secondary = the usual toolbar button. ghost = tertiary/inline. danger = destructive or on-air actions. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** sm 28px (dense toolbars), md 34px (default), lg 42px (marketing CTAs). */
  size?: "sm" | "md" | "lg";
  /** Lucide icon name rendered before the label. */
  icon?: string;
  /** Lucide icon name rendered after the label. */
  iconRight?: string;
  loading?: boolean;
  fullWidth?: boolean;
}

export declare function Button(props: ButtonProps): JSX.Element;
