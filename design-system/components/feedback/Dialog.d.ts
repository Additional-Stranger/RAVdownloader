import * as React from "react";

/**
 * Modal for confirmations and short focused forms.
 * @startingPoint section="Feedback" subtitle="Dialog, toast and tooltip" viewport="700x340"
 */
export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  title?: React.ReactNode;
  /** One or two sentences stating the consequence of the action. */
  description?: React.ReactNode;
  /** Right-aligned action row — cancel first, confirm last. */
  footer?: React.ReactNode;
  width?: number;
  onClose?: () => void;
  /** danger turns the title red for destructive confirmations. */
  tone?: "default" | "danger";
}

export declare function Dialog(props: DialogProps): JSX.Element;
