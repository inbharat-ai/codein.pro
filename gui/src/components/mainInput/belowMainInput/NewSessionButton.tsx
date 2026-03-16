import React from "react";
import { getFontSize } from "../../../util";

export const NewSessionButton: React.FC<
  React.HTMLAttributes<HTMLDivElement>
> = ({ className, style, ...props }) => (
  <div
    className={`codin-new-session-btn ${className ?? ""}`}
    style={{ fontSize: `${getFontSize() - 2}px`, ...style }}
    {...props}
  />
);
