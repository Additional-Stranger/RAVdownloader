import * as React from "react";

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "info" | "ok" | "warn" | "error";
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Usually a ghost Button — "View log", "Retry". */
  action?: React.ReactNode;
  onDismiss?: () => void;
}

export declare function Toast(props: ToastProps): JSX.Element;
