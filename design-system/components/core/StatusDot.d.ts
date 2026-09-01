import * as React from "react";

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  state?: "live" | "ok" | "warn" | "processing" | "idle" | "accent";
  /** Optional text rendered to the right of the dot. */
  label?: React.ReactNode;
  /** Halo + slow pulse. Only for genuinely live/running things. */
  pulse?: boolean;
  size?: number;
}

export declare function StatusDot(props: StatusDotProps): JSX.Element;
