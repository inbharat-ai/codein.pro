import { ConfigValidationError } from "@codein/config-yaml";
import {
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import React, { useState } from "react";
import { lightGray } from "..";
import { cn } from "../../util/cn";
import { ToolTip } from "../gui/Tooltip";

interface OptionDivProps extends React.HTMLAttributes<HTMLDivElement> {
  isDisabled?: boolean;
  isSelected?: boolean;
  children?: React.ReactNode;
}

export function OptionDiv({
  isDisabled,
  isSelected,
  onClick,
  children,
  style,
  ...rest
}: OptionDivProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        padding: "6px 12px",
        minWidth: 0,
        cursor: isDisabled ? undefined : "pointer",
        opacity: isDisabled ? 0.5 : undefined,
        backgroundColor:
          !isDisabled && isSelected
            ? `${lightGray}22`
            : !isDisabled && hovered
              ? `${lightGray}33`
              : undefined,
        ...style,
      }}
      onMouseEnter={() => !isDisabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={!isDisabled ? onClick : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

export const MAX_HEIGHT_PX = 300;

interface ModelOptionProps {
  children: React.ReactNode;
  idx: number;
  disabled: boolean;
  selected: boolean;
  showConfigure: boolean;
  onOpenConfig: () => void;
  onClick: () => void;
  errors?: ConfigValidationError[];
  onClickError?: (e: React.MouseEvent<HTMLElement>) => void;
}

interface IconBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  $hovered: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  className?: string;
  children?: React.ReactNode;
}

function IconBase({
  $hovered,
  onClick,
  className,
  children,
  ...props
}: IconBaseProps) {
  return (
    <div
      className={cn(
        "rounded-default h-[1.2em] w-[1.2em] cursor-pointer p-1",
        $hovered ? "visible opacity-75" : "invisible opacity-0",
        "hover:bg-lightgray/20 hover:opacity-100",
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

const StyledCog6ToothIcon = ({
  $hovered,
  onClick,
}: {
  $hovered: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}) => (
  <IconBase $hovered={$hovered} onClick={onClick}>
    <Cog6ToothIcon />
  </IconBase>
);

const StyledArrowTopRightOnSquareIcon = ({
  $hovered,
  onClick,
}: {
  $hovered: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}) => (
  <IconBase $hovered={$hovered} onClick={onClick}>
    <ArrowTopRightOnSquareIcon />
  </IconBase>
);

const StyledExclamationTriangleIcon = ({
  $hovered,
  onClick,
  className,
  ...props
}: {
  $hovered: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) => (
  <IconBase
    $hovered={$hovered}
    onClick={onClick}
    className={className}
    {...props}
  >
    <ExclamationTriangleIcon />
  </IconBase>
);

export function Option({
  children,
  idx,
  disabled,
  onClick,
  showConfigure,
  selected,
  errors,
  onClickError,
  onOpenConfig,
}: ModelOptionProps) {
  const [hovered, setHovered] = useState(false);

  function handleOptionClick(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled) {
      e.preventDefault();
      e.stopPropagation();
    }
    onClick();
  }

  return (
    <OptionDiv
      key={idx}
      isDisabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      isSelected={selected}
      onClick={!disabled ? handleOptionClick : undefined}
    >
      <div className="flex w-full flex-col gap-0.5">
        <div className="flex w-full items-center justify-between">
          {children}
          <div className="ml-2 flex items-center">
            {!errors?.length ? (
              showConfigure ? (
                <StyledCog6ToothIcon
                  $hovered={hovered}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenConfig();
                  }}
                />
              ) : (
                <StyledArrowTopRightOnSquareIcon
                  $hovered={hovered}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onOpenConfig();
                  }}
                />
              )
            ) : (
              <ToolTip
                content={
                  <>
                    <div className="font-semibold">Errors</div>
                    {JSON.stringify(errors, null, 2)}
                  </>
                }
              >
                <StyledExclamationTriangleIcon
                  $hovered={hovered}
                  className="cursor-pointer text-red-500"
                  onClick={onClickError}
                />
              </ToolTip>
            )}
          </div>
        </div>
      </div>
    </OptionDiv>
  );
}
