import type { Editor } from "@tiptap/react";
import type { RangeInFile } from "core";
import { forwardRef, useContext, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { lightGray } from "../..";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { useAppSelector } from "../../../redux/hooks";
import { setDialogMessage, setShowDialog } from "../../../redux/slices/uiSlice";
import { fontSize } from "../../../util";
import AddDocsDialog from "../../dialogs/AddDocsDialog";
import { DropdownIcon } from "./DropdownIcon";
import { DropdownItem } from "./DropdownItem";
import { QuerySubmenuInput } from "./QuerySubmenuInput";
import { useDropdownKeyboard } from "./useDropdownKeyboard";
import type { ComboBoxItem, ComboBoxItemType } from "../types";

export { getIconFromDropdownItem } from "./DropdownIcon";

interface AtMentionDropdownProps {
  items: ComboBoxItem[];
  command: (item: ComboBoxItem & { itemType: ComboBoxItemType }) => void;
  editor: Editor;
  enterSubmenu?: (editor: Editor, providerId: string) => void;
  onClose: () => void;
}

const formatFileSize = (fileSize: number) => {
  const KB = 1000;
  const MB = 1000_000;
  const GB = 1000_000_000;
  if (fileSize > GB) return `${(fileSize / GB).toFixed(1)} GB`;
  else if (fileSize > MB) return `${(fileSize / MB).toFixed(1)} MB`;
  else if (fileSize > KB) return `${(fileSize / KB).toFixed(1)} KB`;
  return `${fileSize} byte${fileSize > 1 ? "s" : ""}`;
};

const AtMentionDropdown = forwardRef((props: AtMentionDropdownProps, ref) => {
  const dispatch = useDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const isInAgentMode = useAppSelector(
    (store) => store.session.mode === "agent",
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subMenuTitle, setSubMenuTitle] = useState<string | undefined>(
    undefined,
  );
  const [querySubmenuItem, setQuerySubmenuItem] = useState<
    ComboBoxItem | undefined
  >(undefined);
  const [loadingSubmenuItem, setLoadingSubmenuItem] = useState<
    ComboBoxItem | undefined
  >(undefined);
  const [allItems, setAllItems] = useState<ComboBoxItem[]>([]);

  async function isItemTooBig(
    name: string,
    query: string,
  ): Promise<[boolean, number]> {
    const selectedCode: RangeInFile[] = [];
    const contextResult = await ideMessenger.request(
      "context/getContextItems",
      {
        name,
        query,
        fullInput: "",
        selectedCode,
        isInAgentMode,
      },
    );
    if (contextResult.status === "error") return [false, -1];
    const item = contextResult.content[0];
    const result = await ideMessenger.request("isItemTooBig", { item });
    if (result.status === "error") return [false, -1];
    const size = new Blob([item.content]).size;
    return [result.content, size];
  }

  function handleItemTooBig(
    fileExceeds: boolean,
    fileSize: number,
    item: ComboBoxItem,
  ) {
    if (fileExceeds) {
      props.editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const text = state.doc.textBetween(
            0,
            state.selection.from,
            "\n",
            "\n",
          );
          const lastAtIndex = text.lastIndexOf("@");
          if (lastAtIndex !== -1) {
            tr.delete(lastAtIndex + 1, state.selection.from);
            return true;
          }
          return false;
        })
        .run();
      void ideMessenger.ide.showToast(
        "warning",
        fileSize > 0
          ? "File exceeds model's context length"
          : "Error loading file",
        {
          modal: true,
          detail:
            fileSize > 0
              ? `'${item.title}' cannot be added because it exceeds the model's allowed context length. File size: ${formatFileSize(fileSize)}`
              : `'${item.title}' could not be loaded. Please check if the file exists and has the correct permissions.`,
        },
      );
    } else {
      props.command({ ...item, itemType: item.type });
    }
  }

  useEffect(() => {
    const items = [...props.items];
    if (subMenuTitle === "Type to search docs") {
      items.push({
        title: "Add Docs",
        type: "action",
        action: () => {
          dispatch(setShowDialog(true));
          dispatch(setDialogMessage(<AddDocsDialog />));
          const { tr } = props.editor.view.state;
          const text = tr.doc.textBetween(0, tr.selection.from);
          const start = text.lastIndexOf("@");
          props.editor.view.dispatch(
            tr.delete(start, tr.selection.from).scrollIntoView(),
          );
        },
        description: "",
      });
    } else if (subMenuTitle === ".prompt files") {
      items.push({
        title: "New .prompt file",
        type: "action",
        action: () => {
          ideMessenger.post("config/newPromptFile", undefined);
          const { tr } = props.editor.view.state;
          const text = tr.doc.textBetween(0, tr.selection.from);
          const start = text.lastIndexOf("@");
          if (start !== -1) {
            props.editor.view.dispatch(
              tr.delete(start, tr.selection.from).scrollIntoView(),
            );
          }
          props.onClose();
        },
        description: "Create a new .prompt file",
      });
    } else if (subMenuTitle === "Mention rules files") {
      items.push({
        title: "Add new rule",
        type: "action",
        action: () => {
          void ideMessenger.request("config/addLocalWorkspaceBlock", {
            blockType: "rules",
          });
          const { tr } = props.editor.view.state;
          const text = tr.doc.textBetween(0, tr.selection.from);
          const start = text.lastIndexOf("@");
          if (start !== -1) {
            props.editor.view.dispatch(
              tr.delete(start, tr.selection.from).scrollIntoView(),
            );
          }
          props.onClose();
        },
        description: "Creates a rule file",
      });
    }
    setLoadingSubmenuItem(items.find((item) => item.id === "loading"));
    setAllItems(items.filter((item) => item.id !== "loading"));
  }, [subMenuTitle, props.items, props.editor]);

  const selectItem = (index: number) => {
    const item = allItems[index];
    if (item.type === "action" && item.action) {
      item.action();
      return;
    }
    if (
      item.type === "contextProvider" &&
      item.contextProvider?.type === "submenu"
    ) {
      setSubMenuTitle(item.description);
      if (item.id) props.enterSubmenu?.(props.editor, item.id);
      return;
    }
    if (item.contextProvider?.type === "query") {
      const { tr } = props.editor.view.state;
      const text = tr.doc.textBetween(0, tr.selection.from);
      const partialText = text.slice(text.lastIndexOf("@") + 1);
      const remainingText = item.title.slice(partialText.length);
      props.editor.view.dispatch(
        tr.insertText(remainingText, tr.selection.from),
      );
      setSubMenuTitle(item.description);
      setQuerySubmenuItem(item);
      return;
    }
    if (item) {
      if (item.type === "file" && item.query) {
        void isItemTooBig(item.type, item.query).then(
          ([fileExceeds, fileSize]) =>
            handleItemTooBig(fileExceeds, fileSize, item),
        );
      } else {
        props.command({ ...item, itemType: item.type });
      }
    }
  };

  useEffect(() => setSelectedIndex(0), [allItems]);

  const { itemRefs } = useDropdownKeyboard({
    allItems,
    selectedIndex,
    setSelectedIndex,
    selectItem,
    ref,
  });

  return (
    <div className="codin-at-items-div" style={{ fontSize: fontSize(-2) }}>
      {querySubmenuItem ? (
        <QuerySubmenuInput
          querySubmenuItem={querySubmenuItem}
          onSubmit={(query) => {
            props.command({
              ...querySubmenuItem,
              itemType: querySubmenuItem.type,
              query,
              label: `${querySubmenuItem.label}: ${query}`,
            });
          }}
          onEscape={() => {
            setQuerySubmenuItem(undefined);
            setSubMenuTitle(undefined);
          }}
          command={(item) => props.command(item)}
        />
      ) : (
        <>
          {subMenuTitle && (
            <div
              className="codin-at-item-div mb-2"
              style={{ fontSize: fontSize(-2) }}
            >
              {subMenuTitle}
            </div>
          )}
          {loadingSubmenuItem && (
            <div
              className="codin-at-item-div"
              style={{ fontSize: fontSize(-2) }}
            >
              <span className="flex w-full items-center justify-between">
                <div className="flex items-center justify-center">
                  <DropdownIcon item={loadingSubmenuItem} className="mr-2" />
                  <span>{loadingSubmenuItem.title}</span>
                  {"  "}
                </div>
                <span
                  style={{
                    color: lightGray,
                    float: "right",
                    textAlign: "right",
                    minWidth: "30px",
                  }}
                  className="ml-2 flex items-center overflow-hidden overflow-ellipsis whitespace-nowrap"
                >
                  {loadingSubmenuItem.description}
                </span>
              </span>
            </div>
          )}
          {allItems.length ? (
            allItems.map((item, index) => (
              <DropdownItem
                key={index}
                item={item}
                index={index}
                isSelected={index === selectedIndex}
                subMenuTitle={subMenuTitle}
                onSelect={selectItem}
                onHover={setSelectedIndex}
                onClose={props.onClose}
                itemRef={(el) => (itemRefs.current[index] = el)}
              />
            ))
          ) : (
            <div
              className="codin-at-item-div item whitespace-nowrap"
              style={{ fontSize: fontSize(-2) }}
            >
              No results
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default AtMentionDropdown;
