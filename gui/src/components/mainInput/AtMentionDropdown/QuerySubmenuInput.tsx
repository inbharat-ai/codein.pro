import { useRef, useEffect } from "react";
import { Button } from "../../ui";
import type { ComboBoxItem, ComboBoxItemType } from "../types";

interface QuerySubmenuInputProps {
  querySubmenuItem: ComboBoxItem;
  onSubmit: (query: string) => void;
  onEscape: () => void;
  command: (
    item: ComboBoxItem & {
      itemType: ComboBoxItemType;
      query: string;
      label: string;
    },
  ) => void;
}

export function QuerySubmenuInput({
  querySubmenuItem,
  onSubmit,
  onEscape,
  command,
}: QuerySubmenuInputProps) {
  const queryInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (queryInputRef.current) {
      queryInputRef.current.focus();
    }
  }, [querySubmenuItem]);

  return (
    <span className="flex items-center gap-x-1">
      <textarea
        className="codin-at-query-input"
        wrap="off"
        onClick={(e) => e.stopPropagation()}
        rows={1}
        ref={queryInputRef}
        placeholder={querySubmenuItem.description}
        onKeyDown={(e) => {
          if (!queryInputRef.current) return;
          if (e.key === "Enter") {
            if (e.shiftKey) {
              queryInputRef.current.innerText += "\n";
            } else {
              command({
                ...querySubmenuItem,
                itemType: querySubmenuItem.type,
                query: queryInputRef.current.value,
                label: `${querySubmenuItem.label}: ${queryInputRef.current.value}`,
              });
            }
          } else if (e.key === "Escape") {
            onEscape();
          }
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="m-0"
        disabled={!queryInputRef.current}
        onClick={() =>
          command({
            ...querySubmenuItem,
            itemType: querySubmenuItem.type,
            query: queryInputRef.current!.value,
            label: `${querySubmenuItem.label}: ${queryInputRef.current!.value}`,
          })
        }
      >
        ⏎
      </Button>
    </span>
  );
}
