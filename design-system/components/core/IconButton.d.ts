import * as React from "react";

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Lucide icon name. */
  icon: string;
  /** Required — becomes aria-label and the native tooltip. */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "outline" | "solid";
  /** Toggled-on state for tool-palette buttons. */
  active?: boolean;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
