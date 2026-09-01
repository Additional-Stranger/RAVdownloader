import * as React from "react";

export interface TabItem { value: string; label: React.ReactNode; icon?: string; count?: number }

/**
 * In-page view switcher.
 * @startingPoint section="Navigation" subtitle="Underline and segmented tab bars" viewport="700x150"
 */
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  /** underline = page-level sections. segmented = filter/scope switch inside a panel. */
  variant?: "underline" | "segmented";
}

export declare function Tabs(props: TabsProps): JSX.Element;
