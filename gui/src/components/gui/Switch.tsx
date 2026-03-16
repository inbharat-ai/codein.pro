import { InformationCircleIcon } from "@heroicons/react/24/outline";
import React, { ReactNode } from "react";
import { vscButtonBackground } from "..";
import { ToolTip } from "./Tooltip";

type ToggleSwitchProps = {
  isToggled: boolean;
  onToggle: () => void;
  text: string;
  size?: number;
  showIfToggled?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
  "aria-label"?: string;
};

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  isToggled,
  onToggle,
  text,
  size = 16,
  showIfToggled,
  disabled = false,
  tooltip,
  "aria-label": ariaLabel,
}) => {
  return (
    <div
      className={`flex select-none items-center justify-between gap-3 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span className="truncate-right flex items-center gap-x-1">
        {text}{" "}
        {tooltip && (
          <ToolTip content={tooltip}>
            <InformationCircleIcon className="h-3 w-3" />
          </ToolTip>
        )}
      </span>
      <div className="flex flex-row items-center gap-1">
        {isToggled && !!showIfToggled && showIfToggled}
        <div
          role="switch"
          aria-checked={isToggled}
          aria-label={ariaLabel}
          tabIndex={disabled ? -1 : 0}
          className={`border-command-border bg-codin-bg-surface relative flex items-center rounded-full border border-solid`}
          onClick={
            disabled
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  onToggle();
                }
          }
          onKeyDown={
            disabled
              ? undefined
              : (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle();
                  }
                }
          }
          style={{
            height: size,
            width: size * 2,
            padding: size / 8,
          }}
        >
          <div
            className={`absolute left-1/4 transform rounded-full border-[0.2px] border-solid transition-all ${isToggled ? "translate-x-1/2 brightness-150" : "-translate-x-1/2 brightness-75"}`}
            style={{
              backgroundColor: isToggled ? vscButtonBackground : "",
              height: size,
              width: size,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ToggleSwitch;
