import { useContext } from "react";
import { IdeMessengerContext } from "../../../../context/IdeMessenger";
import { getFontSize } from "../../../../util";
import { GeneratingIndicator } from "./GeneratingIndicator";

export function TtsActiveToolbar() {
  const ideMessenger = useContext(IdeMessengerContext);

  return (
    <div className="flex w-full items-center justify-between">
      <GeneratingIndicator />
      <div
        className="text-description cursor-pointer py-0.5 pr-1"
        style={{ fontSize: `${getFontSize() - 3}px` }}
        onClick={() => {
          ideMessenger.post("tts/kill", undefined);
        }}
      >
        ■ Stop TTS
      </div>
    </div>
  );
}
