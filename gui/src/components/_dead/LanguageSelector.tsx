import { useContext, useState } from "react";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { MicrophoneIcon } from "@heroicons/react/24/outline";

const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "as", name: "Assamese", native: "অসমীয়া" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
];

export function LanguageSelector() {
  const dispatch = useAppDispatch();
  const [selectedLang, setSelectedLang] = useState("auto");

  return (
    <div className="flex items-center gap-2">
      <div className="text-xs opacity-70">Language:</div>
      <select
        value={selectedLang}
        onChange={(e) => setSelectedLang(e.target.value)}
        className="bg-vsc-input-background rounded px-2 py-1 text-xs"
      >
        <option value="auto">Auto-detect</option>
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
          </option>
        ))}
      </select>
    </div>
  );
}
