// The `common` set from lowlight already covers ~35 languages including
// JavaScript, TypeScript, Python, Java, C/C++, Go, Rust, Ruby, PHP, SQL,
// Bash, JSON, YAML, XML, CSS, HTML, Markdown, and more.
// Niche languages (clojure, delphi, elixir, julia, etc.) are omitted to
// save ~80 KB from the initial bundle. They can be registered on-demand
// if needed in the future.
import { common } from "lowlight";
import rehypeHighlight, { Options } from "rehype-highlight";

export function rehypeHighlightPlugin() {
  return [
    rehypeHighlight,
    {
      languages: {
        ...common,
      },
    } as Options,
  ];
}
