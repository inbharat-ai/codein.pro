import { PlayIcon } from "@heroicons/react/24/outline";
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";

// Inject keyframes once
if (typeof document !== "undefined") {
  const styleId = "codin-loader-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes loaderFlash {
        0% { opacity: 0.4; }
        50% { opacity: 1; }
        100% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }
}

const DEFAULT_SIZE = "28px";

function Loader(props: { size?: string }) {
  const vscMediaUrl = window.vscMediaUrl;
  return (
    <div
      style={{
        marginTop: 16,
        margin: "auto",
        width: DEFAULT_SIZE,
        animation: "loaderFlash 1.2s infinite ease-in-out",
      }}
    >
      {vscMediaUrl ? (
        <img src={`${vscMediaUrl}/play_button.png`} width="22px" />
      ) : (
        <PlayIcon width={props.size || DEFAULT_SIZE} />
      )}
    </div>
  );
}

export default Loader;
