import { ChevronDownIcon } from "@heroicons/react/24/outline";
import Anser, { AnserJsonEntry } from "anser";
import { ToolCallState } from "core";
import { escapeCarriageReturn } from "escape-carriage";
import { useMemo, useState } from "react";
import { useAppDispatch } from "../../redux/hooks";
import { moveTerminalProcessToBackground } from "../../redux/thunks/moveTerminalProcessToBackground";
import { getFontSize } from "../../util";
import { CopyButton } from "../StyledMarkdownPreview/StepContainerPreToolbar/CopyButton";
import { RunInTerminalButton } from "../StyledMarkdownPreview/StepContainerPreToolbar/RunInTerminalButton";
import { ButtonContent, SpoilerButton } from "../ui/SpoilerButton";

// Inject keyframes once
if (typeof document !== "undefined") {
  const styleId = "unified-terminal-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes blinkCursor {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      .codin-blinking-cursor::after {
        content: "█";
        animation: blinkCursor 1s infinite;
        color: var(--foreground);
      }
      .codin-terminal-content pre {
        white-space: pre-wrap;
        max-width: calc(100vw - 24px);
        overflow-x: scroll;
        overflow-y: hidden;
        padding: 8px;
        margin: 0;
      }
      .codin-terminal-content code {
        word-wrap: break-word;
        border-radius: 0.5rem;
        background-color: var(--editor-background);
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
      }
      .codin-terminal-content code:not(pre > code) {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
        color: var(--input-placeholder);
      }
      .codin-terminal-content span.line:empty { display: none; }
    `;
    document.head.appendChild(style);
  }
}

function ansiToJSON(
  input: string,
  use_classes: boolean = false,
): AnserJsonEntry[] {
  input = escapeCarriageReturn(fixBackspace(input));
  return Anser.ansiToJson(input, {
    json: true,
    remove_empty: true,
    use_classes,
  });
}

function createClass(bundle: AnserJsonEntry): string | null {
  let classNames: string = "";

  if (bundle.bg) {
    classNames += `${bundle.bg}-bg `;
  }
  if (bundle.fg) {
    classNames += `${bundle.fg}-fg `;
  }
  if (bundle.decoration) {
    classNames += `ansi-${bundle.decoration} `;
  }

  if (classNames === "") {
    return null;
  }

  classNames = classNames.substring(0, classNames.length - 1);
  return classNames;
}

function getDecorationStyle(
  decoration: string | undefined,
): React.CSSProperties {
  switch (decoration) {
    case "bold":
      return { fontWeight: "bold" };
    case "dim":
      return { opacity: 0.5 };
    case "italic":
      return { fontStyle: "italic" };
    case "hidden":
      return { visibility: "hidden" };
    case "strikethrough":
      return { textDecoration: "line-through" };
    case "underline":
      return { textDecoration: "underline" };
    case "blink":
      return { textDecoration: "blink" as any };
    default:
      return {};
  }
}

function convertBundleIntoReact(
  linkify: boolean,
  useClasses: boolean,
  bundle: AnserJsonEntry,
  key: number,
): JSX.Element {
  const className = useClasses ? createClass(bundle) : null;
  const decoration = bundle.decoration ? String(bundle.decoration) : undefined;

  const spanStyle: React.CSSProperties = useClasses
    ? {}
    : {
        ...(bundle.bg ? { backgroundColor: `rgb(${bundle.bg})` } : {}),
        ...(bundle.fg ? { color: `rgb(${bundle.fg})` } : {}),
        ...getDecorationStyle(decoration),
      };

  if (!linkify) {
    return (
      <span key={key} className={className || undefined} style={spanStyle}>
        {bundle.content}
      </span>
    );
  }

  const content: React.ReactNode[] = [];
  const linkRegex =
    /(\s|^)(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/g;

  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(bundle.content)) !== null) {
    const [, pre, url] = match;

    const startIndex = match.index + pre.length;
    if (startIndex > index) {
      content.push(bundle.content.substring(index, startIndex));
    }

    const href = url.startsWith("www.") ? `http://${url}` : url;

    content.push(
      <a
        key={index}
        href={href}
        target="_blank"
        style={{ color: "var(--link)", textDecoration: "none" }}
        onMouseEnter={(e) =>
          ((e.target as HTMLElement).style.textDecoration = "underline")
        }
        onMouseLeave={(e) =>
          ((e.target as HTMLElement).style.textDecoration = "none")
        }
      >
        {url}
      </a>,
    );

    index = linkRegex.lastIndex;
  }

  if (index < bundle.content.length) {
    content.push(bundle.content.substring(index));
  }

  return (
    <span key={key} className={className || undefined} style={spanStyle}>
      {content}
    </span>
  );
}

function fixBackspace(txt: string) {
  let tmp = txt;
  do {
    txt = tmp;
    tmp = txt.replace(/[^\n]\x08/gm, "");
  } while (tmp.length < txt.length);
  return txt;
}

function AnsiRenderer({
  children,
  linkify = false,
}: {
  children?: string;
  linkify?: boolean;
}) {
  const ansiContent = ansiToJSON(children ?? "", false).map((bundle, i) =>
    convertBundleIntoReact(linkify, false, bundle, i),
  );

  return <>{ansiContent}</>;
}

interface StatusIconProps {
  status: "running" | "completed" | "failed" | "background";
}

function StatusIcon({ status }: StatusIconProps) {
  const getStatusColor = () => {
    switch (status) {
      case "running":
        return "bg-success";
      case "completed":
        return "bg-success";
      case "background":
        return "bg-accent";
      case "failed":
        return "bg-error";
      default:
        return "bg-success";
    }
  };

  return (
    <span
      className={`mr-2 h-2 w-2 rounded-full ${getStatusColor()} ${
        status === "running" ? "animate-pulse" : ""
      }`}
    />
  );
}

interface IndicatorOnlyProps {
  hiddenLinesCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function IndicatorOnly({
  hiddenLinesCount,
  isExpanded,
  onToggle,
}: IndicatorOnlyProps) {
  return (
    <div className="flex justify-center">
      <SpoilerButton onClick={onToggle}>
        <ButtonContent>
          <span>
            {isExpanded ? "Collapse" : `+${hiddenLinesCount} more lines`}
          </span>
          <ChevronDownIcon
            className={`h-3 w-3 ${isExpanded ? "rotate-180" : ""}`}
          />
        </ButtonContent>
      </SpoilerButton>
    </div>
  );
}

interface CollapsibleOutputContainerProps {
  limitedContent: string;
  fullContent: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function CollapsibleOutputContainer({
  limitedContent,
  fullContent,
  isExpanded,
  onToggle,
}: CollapsibleOutputContainerProps) {
  return (
    <div className="relative">
      {/* Gradient overlay when collapsed */}
      {!isExpanded && (
        <div className="from-editor pointer-events-none absolute left-0 right-0 top-0 z-[5] h-[100px] rounded-t-md bg-gradient-to-b to-transparent" />
      )}

      <div onClick={onToggle} className="cursor-pointer">
        <div>
          <AnsiRenderer linkify>
            {isExpanded ? fullContent : limitedContent}
          </AnsiRenderer>
        </div>
      </div>
    </div>
  );
}

interface UnifiedTerminalCommandProps {
  command: string;
  output?: string;
  status?: "running" | "completed" | "failed" | "background";
  statusMessage?: string;
  toolCallState?: ToolCallState;
  toolCallId?: string;
  displayLines?: number;
}

export function UnifiedTerminalCommand({
  command,
  output = "",
  status = "completed",
  statusMessage = "",
  toolCallState,
  toolCallId,
  displayLines = 15,
}: UnifiedTerminalCommandProps) {
  const dispatch = useAppDispatch();
  const [isExpanded, setIsExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(false);

  // Determine running state
  const isRunning = toolCallState?.status === "calling" || status === "running";
  const hasOutput = output.length > 0;

  // Process terminal content for line limiting
  const processedTerminalContent = useMemo(() => {
    if (!output) {
      return {
        fullContent: "",
        limitedContent: "",
        totalLines: 0,
        isLimited: false,
        hiddenLinesCount: 0,
      };
    }

    const lines = output.split("\n");
    const totalLines = lines.length;

    if (totalLines > displayLines) {
      const lastLines = lines.slice(-displayLines);
      return {
        fullContent: output,
        limitedContent: lastLines.join("\n"),
        totalLines,
        isLimited: true,
        hiddenLinesCount: totalLines - displayLines,
      };
    }

    return {
      fullContent: output,
      limitedContent: output,
      totalLines,
      isLimited: false,
      hiddenLinesCount: 0,
    };
  }, [output, displayLines]);

  // Determine status type
  let statusType: "running" | "completed" | "failed" | "background" = status;
  if (isRunning) {
    statusType = "running";
  } else if (statusMessage?.includes("failed")) {
    statusType = "failed";
  } else if (statusMessage?.includes("background")) {
    statusType = "background";
  }

  const handleMoveToBackground = () => {
    if (toolCallId) {
      void dispatch(
        moveTerminalProcessToBackground({
          toolCallId,
        }),
      );
    }
  };

  // Create combined content for copying (command + output)
  const copyContent = useMemo(() => {
    let content = `$ ${command}`;
    if (hasOutput) {
      content += `\n\n${output}`;
    }
    return content;
  }, [command, output, hasOutput]);

  return (
    <div
      className="mx-2 mb-4"
      style={{
        backgroundColor: "var(--background)",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        fontSize: `${getFontSize()}px`,
        color: "var(--foreground)",
        lineHeight: 1.5,
      }}
      data-testid="terminal-container"
    >
      <div className="outline-command-border rounded-default bg-editor !my-2 flex min-w-0 flex-col outline outline-1">
        {/* Toolbar */}
        <div
          className={`find-widget-skip bg-editor sticky -top-2 z-10 m-0 flex items-center justify-between gap-3 px-1.5 py-1 ${
            isExpanded
              ? "rounded-t-default border-command-border border-b"
              : "rounded-default"
          }`}
          style={{ fontSize: `${getFontSize() - 2}px` }}
        >
          <div className="flex max-w-[50%] flex-row items-center">
            <ChevronDownIcon
              onClick={() => setIsExpanded(!isExpanded)}
              className={`text-description h-3.5 w-3.5 flex-shrink-0 cursor-pointer hover:brightness-125 ${
                isExpanded ? "rotate-0" : "-rotate-90"
              }`}
            />
            <span className="text-description ml-2 select-none">Terminal</span>
          </div>

          <div className="flex items-center gap-2.5">
            {!isRunning && (
              <div className="xs:flex hidden items-center gap-2.5">
                <CopyButton text={copyContent} />
                <RunInTerminalButton command={command} />
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div
            className="codin-terminal-content"
            style={{ fontSize: `${getFontSize() - 2}px` }}
          >
            <pre className="bg-editor">
              <code>
                {/* Command is always visible */}
                <div className="text-terminal pb-2">$ {command}</div>

                {/* Running state with cursor */}
                {isRunning && !hasOutput && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="codin-blinking-cursor" />
                  </div>
                )}

                {/* Output with optional collapsible functionality */}
                {hasOutput && (
                  <div className="mt-1">
                    {/* Expand/Collapse indicator positioned between command and output */}
                    {processedTerminalContent.isLimited && (
                      <IndicatorOnly
                        hiddenLinesCount={
                          processedTerminalContent.hiddenLinesCount
                        }
                        isExpanded={outputExpanded}
                        onToggle={() => setOutputExpanded(!outputExpanded)}
                      />
                    )}

                    <div className="pt-2">
                      {processedTerminalContent.isLimited ? (
                        <CollapsibleOutputContainer
                          limitedContent={
                            processedTerminalContent.limitedContent
                          }
                          fullContent={processedTerminalContent.fullContent}
                          isExpanded={outputExpanded}
                          onToggle={() => setOutputExpanded(!outputExpanded)}
                        />
                      ) : (
                        <div>
                          <AnsiRenderer linkify>
                            {processedTerminalContent.fullContent}
                          </AnsiRenderer>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </code>
            </pre>
          </div>
        )}

        {/* Status information */}
        {(statusMessage || isRunning) && (
          <div
            className="text-description flex items-center px-2 pb-2 pt-2 text-xs"
            style={{
              borderTop: "1px solid var(--codin-border, #2a2845)",
            }}
          >
            <StatusIcon status={statusType} />
            {isRunning ? "Running" : statusMessage}
            {isRunning && toolCallId && (
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleMoveToBackground();
                }}
                className="text-link ml-3 cursor-pointer text-xs no-underline hover:underline"
              >
                Move to background
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
