import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Maps to the status palette: live = on-air/error, processing = running, ok = complete, warn = attention. */
  tone?: "neutral" | "accent" | "live" | "warn" | "ok" | "processing";
  variant?: "soft" | "solid" | "outline";
  icon?: string;
  /** Uppercase + tracked by default; set false for codec strings and filenames. */
  uppercase?: boolean;
}

export declare function Badge(props: BadgeProps): JSX.Element;
