import { ChevronRightIcon } from "@heroicons/react/24/outline";

interface ToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Toggle({
  isOpen,
  onToggle,
  title,
  subtitle,
  children,
}: ToggleProps) {
  return (
    <div>
      <div
        className="flex cursor-pointer items-start gap-2 text-left text-sm font-semibold"
        onClick={onToggle}
      >
        <ChevronRightIcon
          className={`mt-0.5 h-4 w-4 transition-transform ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <div>
          <span>{title}</span>
          {subtitle && (
            <p className="text-description my-1 text-xs font-normal">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
        }}
      >
        <div className="overflow-hidden">
          <div className={`pl-6 ${isOpen ? "mt-4" : ""}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
