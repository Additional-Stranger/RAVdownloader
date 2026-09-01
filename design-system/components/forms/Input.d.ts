import * as React from "react";

/**
 * Text field with label, hint and error states.
 * @startingPoint section="Forms" subtitle="Inputs, selects, toggles and choices" viewport="700x300"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  /** Helper text below the field. */
  hint?: React.ReactNode;
  /** Error message — replaces the hint and turns the field red. */
  error?: React.ReactNode;
  /** Lucide icon inside the field, leading edge. */
  icon?: string;
  /** Trailing mono unit, e.g. "Mbps", "fps", "GB". */
  suffix?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Set true for paths, IPs, codecs, timecode and any machine-shaped value. */
  mono?: boolean;
  multiline?: boolean;
  rows?: number;
}

export declare function Input(props: InputProps): JSX.Element;
