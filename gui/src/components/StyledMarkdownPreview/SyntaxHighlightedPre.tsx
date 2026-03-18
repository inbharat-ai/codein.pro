import { useContext, useId } from "react";
import { defaultBorderRadius, vscForeground } from "..";
import { VscThemeContext } from "../../context/VscTheme";

const generateThemeStyles = (theme: any, scopeId: string) => {
  return Object.keys(theme)
    .map((key) => {
      return `#${scopeId} ${key} { color: ${theme[key]}; }`;
    })
    .join("\n");
};

export const SyntaxHighlightedPre = (props: any) => {
  const currentTheme = useContext(VscThemeContext);
  const scopeId = `sxpre-${useId().replace(/:/g, "")}`;

  const { style: _style, ...rest } = props;

  return (
    <>
      <style>{`
        #${scopeId} .hljs { color: ${vscForeground}; }
        #${scopeId} { margin-top: 0; margin-bottom: 0; border-radius: 0 0 ${defaultBorderRadius} ${defaultBorderRadius} !important; max-height: 40vh; overflow-y: scroll !important; }
        ${generateThemeStyles(currentTheme.theme, scopeId)}
      `}</style>
      <pre id={scopeId} {...rest} />
    </>
  );
};
