import { ChatBubbleOvalLeftIcon } from "@heroicons/react/24/outline";
import { ChatHistoryItem } from "core";
import { lightGray } from "..";
import { getFontSize } from "../../util";

interface TimelineItemProps {
  item: ChatHistoryItem;
  open: boolean;
  onToggle: () => void;
  children: JSX.Element;
  iconElement?: JSX.Element;
}

function TimelineItem(props: TimelineItemProps) {
  return props.open ? (
    props.children
  ) : (
    <div
      style={{
        marginTop: 8,
        marginBottom: 8,
        marginLeft: 8,
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: `${props.item ? getFontSize() : getFontSize()}px`,
        minHeight: 16,
      }}
    >
      {/* CollapseButton */}
      <div
        className="ml-[13px] flex flex-shrink-0 flex-grow-0 cursor-pointer items-center justify-center"
        style={{ backgroundColor: "var(--codin-bg-primary, #0f0e17)" }}
        onClick={() => {
          props.onToggle();
        }}
      >
        {props.iconElement || (
          <ChatBubbleOvalLeftIcon width="16px" height="16px" />
        )}
      </div>
      <span style={{ color: lightGray }}>
        {props.item.message.role} Message
        {/* {props.step.error ? props.step.error.title : props.step.name} */}
      </span>
    </div>
  );
}

export default TimelineItem;
