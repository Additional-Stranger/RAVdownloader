import * as React from "react";

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name, kebab-case, e.g. "film", "hard-drive", "waveform". */
  name: string;
  /** Pixel box. 14 in dense tables, 16 default, 20 in headers. */
  size?: number;
  /** Accessible label; falls back to the icon name. */
  label?: string;
}

export declare function Icon(props: IconProps): JSX.Element;
