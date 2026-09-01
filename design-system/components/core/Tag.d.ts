import * as React from "react";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Renders an inline remove button when provided. */
  onRemove?: (e: React.MouseEvent) => void;
  icon?: string;
  /** Filter-chip selected state. */
  selected?: boolean;
}

export declare function Tag(props: TagProps): JSX.Element;
