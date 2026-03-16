import { XMarkIcon } from "@heroicons/react/24/outline";
import React, { isValidElement } from "react";
import FocusTrap from "focus-trap-react";
import ReactMarkdown from "react-markdown";
import { CloseButton } from "..";

interface TextDialogProps {
  showDialog: boolean;
  onEnter: () => void;
  onClose: () => void;
  message?: string | JSX.Element;
}

const TextDialog = (props: TextDialogProps) => {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      props.onClose();
    }
  };

  if (!isValidElement(props.message) && typeof props.message !== "string") {
    return null;
  }

  return (
    <div
      className="codin-screen-cover"
      onClick={props.onClose}
      hidden={!props.showDialog}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <FocusTrap
        active={props.showDialog}
        focusTrapOptions={{
          allowOutsideClick: true,
          escapeDeactivates: false,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dialog"
          aria-labelledby="codin-dialog-title"
          aria-describedby={props.message ? "codin-dialog-desc" : undefined}
          className="codin-dialog-container xs:w-[90%] no-scrollbar max-h-[95%] w-[92%] max-w-[600px] overflow-auto sm:w-[88%] md:w-[80%]"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <span id="codin-dialog-title" className="sr-only">
            Dialog
          </span>
          <CloseButton aria-label="Close dialog" onClick={props.onClose}>
            <XMarkIcon className="z-50 h-5 w-5 hover:brightness-125" />
          </CloseButton>

          <div id="codin-dialog-desc">
            {typeof props.message === "string" ? (
              <ReactMarkdown>{props.message || ""}</ReactMarkdown>
            ) : !React.isValidElement(props.message) ? null : (
              props.message
            )}
          </div>
        </div>
      </FocusTrap>
    </div>
  );
};

export default TextDialog;
