import * as React from "react";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  /** Second line explaining consequences — common on batch-operation options. */
  description?: React.ReactNode;
  /** Mixed state for partially-selected groups (e.g. some clips in a bin). */
  indeterminate?: boolean;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;
