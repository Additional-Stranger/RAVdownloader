import * as React from "react";

export interface TimecodeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** SMPTE string, e.g. "01:23:45:12". */
  value: string;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "muted" | "accent" | "live";
  /** Renders the frame separator as a semicolon, per drop-frame convention. */
  dropFrame?: boolean;
}

export declare function Timecode(props: TimecodeProps): JSX.Element;
