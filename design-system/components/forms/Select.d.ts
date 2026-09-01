import * as React from "react";

export interface SelectOption { value: string; label: string }

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Plain strings or {value,label} pairs. */
  options?: Array<string | SelectOption>;
  size?: "sm" | "md" | "lg";
}

export declare function Select(props: SelectProps): JSX.Element;
