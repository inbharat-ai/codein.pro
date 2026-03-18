import React from "react";

interface HoverItemProps extends React.HTMLAttributes<HTMLSpanElement> {
  isActive?: boolean;
  px?: number;
  children?: React.ReactNode;
}

const HoverItem = React.forwardRef<HTMLSpanElement, HoverItemProps>(
  ({ isActive, px = 4, style, children, ...rest }, ref) => (
    <span
      ref={ref}
      style={{
        padding: `2px ${px}px`,
        cursor: "pointer",
        transition: "color 200ms, background-color 200ms, box-shadow 200ms",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  ),
);

HoverItem.displayName = "HoverItem";

export default HoverItem;
