import {
  AtSymbolIcon,
  ChatBubbleLeftIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import SafeImg from "../../SafeImg";
import { NAMED_ICONS } from "../icons";
import type { ComboBoxItem, ComboBoxItemType } from "../types";

export function getIconFromDropdownItem(
  id: string | undefined,
  type: ComboBoxItemType,
) {
  const typeIcon =
    type === "contextProvider" ? AtSymbolIcon : ChatBubbleLeftIcon;
  return id ? (NAMED_ICONS[id] ?? typeIcon) : typeIcon;
}

export function DropdownIcon(props: {
  className?: string;
  item: ComboBoxItem;
}) {
  if (props.item.type === "action") {
    return <PlusIcon className={props.className + " h-3 w-3"} />;
  }

  const provider =
    props.item.type === "contextProvider" || props.item.type === "slashCommand"
      ? props.item.id
      : props.item.type;

  const IconComponent = getIconFromDropdownItem(provider, props.item.type);

  const fallbackIcon = (
    <IconComponent
      className={`${props.className} flex-shrink-0`}
      height="1.2em"
      width="1.2em"
    />
  );

  if (!props.item.icon) {
    return fallbackIcon;
  }

  return (
    <SafeImg
      className="flex-shrink-0 pr-2"
      src={props.item.icon}
      height="18em"
      width="18em"
      fallback={fallbackIcon}
    />
  );
}
