import React from "react";
import { ModeSelector } from "../../components/ModeSelector";
import { ModelBadge } from "../../components/ModelBadge";
import { SovereignModeBadge } from "../../components/SovereignModeBadge";

interface ChatHeaderProps {
  modelTitle: string;
}

export const ChatHeader = React.memo(function ChatHeader({
  modelTitle,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <ModeSelector />
      <div className="ml-auto flex items-center gap-1.5">
        {modelTitle && <ModelBadge model={modelTitle} compact />}
        <SovereignModeBadge compact alwaysShow />
      </div>
    </div>
  );
});
