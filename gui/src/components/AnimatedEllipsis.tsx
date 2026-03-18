import type { FC } from "react";

/**
 * AnimatedEllipsis — renders a "..." that animates from 0→1em width.
 *
 * Uses a plain CSS class defined in index.css instead of styled-components,
 * keeping the component dependency-free and consistent with the Tailwind-first
 * design system.
 */
export const AnimatedEllipsis: FC<{ className?: string }> = ({
  className = "",
}) => (
  <span className={`animated-ellipsis inline-block w-[1em] ${className}`} />
);

export default AnimatedEllipsis;
