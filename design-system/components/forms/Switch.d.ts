import * as React from "react";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md";
}

export declare function Switch(props: SwitchProps): JSX.Element;
