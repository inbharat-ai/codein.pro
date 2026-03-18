import { CheckIcon } from "@heroicons/react/24/outline";
import React, { useState } from "react";
import { defaultBorderRadius, vscBackground, vscForeground } from ".";

interface CheckDivProps {
  title: string;
  checked: boolean;
  onClick: () => void;
}

function CheckDiv(props: CheckDivProps) {
  const { title, checked, onClick } = props;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.5rem",
        borderRadius: defaultBorderRadius,
        cursor: "pointer",
        border: `1px solid ${vscForeground}`,
        color: hovered ? vscBackground : vscForeground,
        backgroundColor: hovered ? vscForeground : vscBackground,
        width: "fit-content",
        margin: "0.5rem",
        height: "1.4em",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {checked && <CheckIcon width="1.4em" height="1.4em" />}
      {title}
    </div>
  );
}

export default CheckDiv;
