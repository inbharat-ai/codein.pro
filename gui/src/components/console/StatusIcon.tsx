import {
  CheckIcon,
  EllipsisHorizontalIcon,
  StopCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { LLMInteraction } from "../../hooks/useLLMLog";

export interface StatusIconProps {
  interaction: LLMInteraction;
}

export default function StatusIcon({ interaction }: StatusIconProps) {
  if (interaction.end) {
    switch (interaction.end.kind) {
      case "success":
        return (
          <CheckIcon className="text-[color:var(--codin-saffron-500, #22c55e)] relative top-[2px] -mt-[2px] h-[16px] w-[16px] pr-[2px]" />
        );
      case "cancel":
        return (
          <StopCircleIcon className="text-[color:var(--codin-saffron-500, #f59e0b)] relative top-[2px] -mt-[2px] h-[16px] w-[16px] pr-[2px]" />
        );
      case "error":
        return (
          <XCircleIcon className="text-[color:var(--codin-saffron-700, #b45309)] relative top-[2px] -mt-[2px] h-[16px] w-[16px] pr-[2px]" />
        );
    }
  } else {
    return (
      <EllipsisHorizontalIcon className="relative top-[2px] -mt-[2px] h-[16px] w-[16px] pr-[2px]" />
    );
  }
}
