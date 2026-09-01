import * as React from "react";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100. Ignored when indeterminate. */
  value?: number;
  tone?: "accent" | "ok" | "warn" | "live" | "processing";
  indeterminate?: boolean;
  /** Track height in px — 4 default, 6 for hero progress, 2 inside table rows. */
  height?: number;
  label?: React.ReactNode;
  /** Right-aligned mono readout, e.g. "62% · 4m 12s left". */
  valueLabel?: React.ReactNode;
}

export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
