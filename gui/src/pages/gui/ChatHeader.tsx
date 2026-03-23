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
    <div
      className="flex items-center gap-3 border-b px-3 py-1.5"
      style={{
        borderColor: "var(--codin-border, rgba(99,102,241,0.12))",
        background: "var(--codin-bg-secondary, #141320)",
        minHeight: 38,
      }}
    >
      <ModeSelector />

      {/* Spacer + divider */}
      <div className="flex-1" />
      <div
        className="h-4 w-px"
        style={{ background: "var(--codin-border, rgba(99,102,241,0.12))" }}
      />

      <div className="flex items-center gap-2">
        {modelTitle && <ModelBadge model={modelTitle} compact />}
        <SovereignModeBadge compact alwaysShow />
      </div>
    </div>
  );
});
