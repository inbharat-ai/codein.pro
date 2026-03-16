import React from "react";
import { getFontSize } from "../../util";

export const SpoilerButton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  style,
  ...props
}) => (
  <div
    className={`codin-spoiler-button ${className ?? ""}`}
    style={{ fontSize: `${getFontSize() - 2}px`, ...style }}
    {...props}
  />
);

export const ButtonContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = (
  props,
) => <div className="codin-button-content" {...props} />;
