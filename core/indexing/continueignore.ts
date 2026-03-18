import fs from "fs";
import { IDE } from "..";
import { getGlobalCodeinIgnorePath } from "../util/paths";
import { gitIgArrayFromFile } from "./ignore";

export const getGlobalContinueIgArray = () => {
  const contents = fs.readFileSync(getGlobalCodeinIgnorePath(), "utf8");
  return gitIgArrayFromFile(contents);
};

export const getWorkspaceContinueIgArray = async (ide: IDE) => {
  const dirs = await ide.getWorkspaceDirs();
  return await dirs.reduce(
    async (accPromise, dir) => {
      const acc = await accPromise;
      // Check .codeignore first, then .continueignore for backward compat
      for (const ignoreFile of [".codeignore", ".continueignore"]) {
        try {
          const contents = await ide.readFile(`${dir}/${ignoreFile}`);
          return [...acc, ...gitIgArrayFromFile(contents)];
        } catch {
          // File doesn't exist, try next
        }
      }
      return acc;
    },
    Promise.resolve([] as string[]),
  );
};
