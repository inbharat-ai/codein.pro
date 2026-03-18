import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { lightGray } from "../..";
import { fontSize } from "../../../util";
import FileIcon from "../../FileIcon";
import HeaderButtonWithToolTip from "../../gui/HeaderButtonWithToolTip";
import { getIconFromDropdownItem, DropdownIcon } from "./DropdownIcon";
import type { ComboBoxItem } from "../types";

interface DropdownItemProps {
  item: ComboBoxItem;
  index: number;
  isSelected: boolean;
  subMenuTitle: string | undefined;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  onClose: () => void;
  itemRef: (el: HTMLButtonElement | null) => void;
}

function showFileIconForItem(item: ComboBoxItem): boolean {
  return ["file", "code"].includes(item.type);
}

export function DropdownItem({
  item,
  index,
  isSelected,
  subMenuTitle,
  onSelect,
  onHover,
  onClose,
  itemRef,
}: DropdownItemProps) {
  return (
    <button
      ref={itemRef}
      className={`codin-at-item-div item cursor-pointer ${isSelected ? "is-selected" : ""}`}
      style={{ fontSize: fontSize(-2) }}
      key={index}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(index);
      }}
      onMouseEnter={() => onHover(index)}
      data-testid="context-provider-dropdown-item"
    >
      <span className="flex w-full items-center justify-between">
        <div className="flex items-center justify-center">
          {showFileIconForItem(item) ? (
            <FileIcon height="20px" width="20px" filename={item.description} />
          ) : (
            <DropdownIcon item={item} className="mr-2" />
          )}
          <span title={item.id} className="whitespace-nowrap">
            {item.title}
          </span>
          {"  "}
        </div>
        <span
          style={{
            color: lightGray,
            float: "right",
            textAlign: "right",
            opacity:
              subMenuTitle || item.type !== "contextProvider"
                ? 1
                : isSelected
                  ? 1
                  : 0,
            minWidth: "30px",
          }}
          className="ml-2 flex items-center overflow-hidden overflow-ellipsis whitespace-nowrap"
        >
          {item.description}
          {item.type === "contextProvider" &&
            item.contextProvider?.type === "submenu" && (
              <ArrowRightIcon
                className="ml-2 flex-shrink-0"
                width="1.2em"
                height="1.2em"
              />
            )}
          {item.subActions?.map((subAction) => {
            const Icon = getIconFromDropdownItem(subAction.icon, "action");
            return (
              <HeaderButtonWithToolTip
                onClick={(e) => {
                  subAction.action(item);
                  e.stopPropagation();
                  e.preventDefault();
                  onClose();
                }}
                text={undefined}
              >
                <Icon width="1.2em" height="1.2em" />
              </HeaderButtonWithToolTip>
            );
          })}
        </span>
      </span>
    </button>
  );
}
