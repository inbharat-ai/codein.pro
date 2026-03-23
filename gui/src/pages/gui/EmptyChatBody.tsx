import {
  ChatBubbleOvalLeftIcon,
  CodeBracketIcon,
  DocumentMagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { ConversationStarterCards } from "../../components/ConversationStarters";
import { OnboardingCard } from "../../components/OnboardingCard";

export interface EmptyChatBodyProps {
  showOnboardingCard?: boolean;
}

const QUICK_ACTIONS = [
  {
    icon: CodeBracketIcon,
    label: "Write code",
    hint: 'Try "Build a REST API with Express"',
  },
  {
    icon: WrenchScrewdriverIcon,
    label: "Fix a bug",
    hint: 'Try "Fix the failing test in auth.ts"',
  },
  {
    icon: DocumentMagnifyingGlassIcon,
    label: "Explain code",
    hint: 'Try "Explain the login flow"',
  },
  {
    icon: ChatBubbleOvalLeftIcon,
    label: "Ask anything",
    hint: 'Try "How does the routing work?"',
  },
];

export function EmptyChatBody({ showOnboardingCard }: EmptyChatBodyProps) {
  if (showOnboardingCard) {
    return (
      <div className="mx-2 mt-6">
        <OnboardingCard />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      {/* Welcome heading */}
      <div className="mb-6 text-center">
        <div
          className="mb-2 flex items-center justify-center"
          style={{ color: "var(--codin-accent-saffron, #f59e0b)" }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--codin-fg-primary, #e8e6f0)" }}
        >
          What would you like to build?
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--codin-fg-muted, #8b88ad)" }}
        >
          Start a conversation to write, debug, or explore code
        </p>
      </div>

      {/* Quick action hints */}
      <div className="mb-6 grid w-full max-w-lg grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((action) => (
          <div
            key={action.label}
            className="flex items-start gap-2.5 rounded-lg p-3 transition-colors"
            style={{
              background: "var(--codin-bg-tertiary, #1a1832)",
              border: "1px solid var(--codin-border, rgba(99,102,241,0.12))",
            }}
          >
            <action.icon
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: "var(--codin-accent-primary, #6366f1)" }}
            />
            <div className="min-w-0">
              <div
                className="text-xs font-medium"
                style={{ color: "var(--codin-fg-primary, #e8e6f0)" }}
              >
                {action.label}
              </div>
              <div
                className="mt-0.5 truncate text-[11px]"
                style={{ color: "var(--codin-fg-muted, #8b88ad)" }}
              >
                {action.hint}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bookmarked slash command starters */}
      <div className="w-full max-w-lg">
        <ConversationStarterCards />
      </div>

      {/* Keyboard hint */}
      <p
        className="mt-4 text-[11px]"
        style={{ color: "var(--codin-fg-muted, #8b88ad)", opacity: 0.7 }}
      >
        Type below or press{" "}
        <kbd
          className="rounded px-1 py-0.5 text-[10px]"
          style={{
            background: "var(--codin-bg-surface, #201e3a)",
            border: "1px solid var(--codin-border, rgba(99,102,241,0.12))",
          }}
        >
          @
        </kbd>{" "}
        to add context
      </p>
    </div>
  );
}
