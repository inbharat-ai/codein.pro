import { ChatBubbleOvalLeftIcon } from "@heroicons/react/24/outline";
import { ChatHistoryItem } from "core";
import styled from "styled-components";
import { lightGray } from "..";
import { getFontSize } from "../../util";

const CollapsedDiv = styled.div<{ fontSize?: number }>`
  margin-top: 8px;
  margin-bottom: 8px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: ${(props) => props.fontSize || getFontSize()}px;
  min-height: 16px;
`;

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
    <CollapsedDiv fontSize={getFontSize()}>
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
    </CollapsedDiv>
  );
}

export default TimelineItem;
