import * as React from "react";

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: React.ReactNode;
  /** Keyboard shortcut rendered as a mono kbd chip — shortcuts matter to this audience. */
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}

export declare function Tooltip(props: TooltipProps): JSX.Element;
