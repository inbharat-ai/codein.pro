import {
  LLMInteractionCancel,
  LLMInteractionError,
  LLMInteractionSuccess,
} from "core";
import Expander from "./Expander";
import Message from "./Message";

export interface StartProps {
  item: LLMInteractionSuccess | LLMInteractionError | LLMInteractionCancel;
}

export default function Start({ item }: StartProps) {
  //  <div className="border-0 border-b-2 border-solid border-[color:var(--codin-border, #2a2845)]">
  switch (item.kind) {
    case "success":
      return <></>;
    case "error":
      return (
        <div>
          <span className="text-[color:var(--codin-fg-primary, #e8e6f0) bg-[color:var(--codin-saffron-700, #b45309)] m-0.5 inline-block rounded-sm p-0.5">
            Error
          </span>
          {item.message}
        </div>
      );
      break;
    case "cancel":
      return (
        <div>
          <span className="text-[color:var(--codin-fg-primary, #e8e6f0) bg-[color:var(--codin-saffron-600, #d97706)] m-0.5 inline-block rounded-sm p-0.5">
            Cancelled
          </span>
        </div>
      );
  }
}
