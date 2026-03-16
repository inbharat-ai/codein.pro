import React from "react";
import { getFontSize } from "../../../../util";

export const InputBoxDiv: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  style,
  ...props
}) => (
  <div
    className={`codin-input-box-div ${className ?? ""}`}
    style={{ fontSize: `${getFontSize()}px`, ...style }}
    {...props}
  />
);

export const HoverDiv: React.FC<React.HTMLAttributes<HTMLDivElement>> = (
  props,
) => <div className="codin-hover-div" {...props} />;

export const HoverTextDiv: React.FC<React.HTMLAttributes<HTMLDivElement>> = (
  props,
) => <div className="codin-hover-text-div" {...props} />;
