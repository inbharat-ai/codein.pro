import React, { useEffect, useImperativeHandle, useRef } from "react";
import type { ComboBoxItem } from "../types";

interface UseDropdownKeyboardOptions {
  allItems: ComboBoxItem[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  selectItem: (index: number) => void;
  ref: React.ForwardedRef<unknown>;
}

export function useDropdownKeyboard({
  allItems,
  selectedIndex,
  setSelectedIndex,
  selectItem,
  ref,
}: UseDropdownKeyboardOptions) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const upHandler = () => {
    setSelectedIndex((prevIndex) => {
      const newIndex = prevIndex - 1 >= 0 ? prevIndex - 1 : 0;
      itemRefs.current[newIndex]?.scrollIntoView({
        behavior: "instant" as ScrollBehavior,
        block: "nearest",
      });
      return newIndex;
    });
  };

  const downHandler = () => {
    setSelectedIndex((prevIndex) => {
      const newIndex =
        prevIndex + 1 < allItems.length ? prevIndex + 1 : prevIndex;
      itemRefs.current[newIndex]?.scrollIntoView({
        behavior: "instant" as ScrollBehavior,
        block: "nearest",
      });
      return newIndex;
    });
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, allItems.length);
  }, [allItems]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }
      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        enterHandler();
        event.stopPropagation();
        event.preventDefault();
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
      if (event.key === " ") {
        if (allItems.length === 1) {
          enterHandler();
          return true;
        }
      }
      return false;
    },
  }));

  return { itemRefs };
}
