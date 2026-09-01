import * as React from "react";

/**
 * Panel container for grouped content.
 * @startingPoint section="Core" subtitle="Card, badge and progress surfaces" viewport="700x260"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  /** Uppercase eyebrow above the title — job type, volume name, category. */
  meta?: React.ReactNode;
  /** Right-aligned header controls, usually IconButtons. */
  actions?: React.ReactNode;
  /** Sunken footer strip for timestamps and secondary metadata. */
  footer?: React.ReactNode;
  /** Adds hover lift + pointer cursor. */
  interactive?: boolean;
  /** Inner padding in px. 20 default, 16 in dense grids. */
  padding?: number;
}

export declare function Card(props: CardProps): JSX.Element;
