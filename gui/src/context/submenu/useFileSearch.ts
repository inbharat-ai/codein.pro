import { ContextSubmenuItemWithProvider } from "core";
import { getUriPathBasename } from "core/util/uri";
import { SearchResult } from "minisearch";
import React, { useCallback } from "react";

// ----- Helper predicates for intelligent file sorting -----

export function hasExactWordMatch(text: string, query: string): boolean {
  const words = text.split(/[^a-zA-Z0-9]+/);
  return words.some((word) => word === query);
}

export function isCommonDevFile(fileName: string): boolean {
  const commonExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".h",
    ".vue",
    ".svelte",
  ];
  const commonNames = [
    "index",
    "main",
    "app",
    "component",
    "service",
    "util",
    "helper",
    "config",
    "types",
  ];
  const extension = fileName.substring(fileName.lastIndexOf("."));
  const baseName = fileName
    .substring(0, fileName.lastIndexOf("."))
    .toLowerCase();
  return commonExtensions.includes(extension) || commonNames.includes(baseName);
}

export function isInCommonDirectory(filePath: string): boolean {
  const commonDirs = [
    "src/",
    "lib/",
    "components/",
    "utils/",
    "helpers/",
    "services/",
    "pages/",
    "views/",
    "hooks/",
    "store/",
    "types/",
    "interfaces/",
    "models/",
    "api/",
  ];
  return commonDirs.some((dir) => filePath.includes(dir));
}

export function matchesCamelCaseOrAbbreviation(
  fileName: string,
  query: string,
): boolean {
  const capitals = fileName.match(/[A-Z]/g)?.join("").toLowerCase() || "";
  if (capitals.length > 0 && capitals.includes(query)) {
    return true;
  }
  const words = fileName.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 0);
  if (words.length > 1) {
    const abbreviation = words
      .map((word) => word[0])
      .join("")
      .toLowerCase();
    return abbreviation.includes(query);
  }
  return false;
}

// ----- Sort priority calculators -----

export function useCalculateFileSortPriority() {
  return useCallback(
    (
      result: SearchResult & ContextSubmenuItemWithProvider,
      query: string,
      openFiles: ContextSubmenuItemWithProvider[],
    ): number => {
      const fileName = result.title.toLowerCase();
      const filePath = result.description.toLowerCase();
      const queryLower = query.toLowerCase();

      if (fileName === queryLower) return 1;
      if (openFiles.some((f) => f.id === result.id)) return 2;
      if (fileName.startsWith(queryLower)) return 3;
      if (hasExactWordMatch(fileName, queryLower)) return 4;
      if (isCommonDevFile(fileName)) return 5;
      if (isInCommonDirectory(filePath)) return 6;
      if (matchesCamelCaseOrAbbreviation(fileName, queryLower)) return 7;
      if (filePath.startsWith(queryLower)) return 8;
      return 9;
    },
    [],
  );
}

export function useCalculateMatchQuality() {
  return useCallback(
    (
      result: SearchResult & ContextSubmenuItemWithProvider,
      query: string,
    ): number => {
      const fileName = result.title.toLowerCase();
      const queryLower = query.toLowerCase();
      let quality = 0;

      if (fileName === queryLower) quality += 100;
      if (fileName.startsWith(queryLower)) quality += 50;
      if (fileName.includes(queryLower)) quality += 25;
      quality += Math.max(0, 50 - fileName.length);
      if (
        fileName.endsWith(".ts") ||
        fileName.endsWith(".tsx") ||
        fileName.endsWith(".js") ||
        fileName.endsWith(".jsx")
      ) {
        quality += 10;
      }
      return quality;
    },
    [],
  );
}

// ----- Open files poller -----

export interface UseOpenFilesPollerOptions {
  ideMessenger: {
    ide: {
      getOpenFiles(): Promise<string[]>;
      getWorkspaceDirs(): Promise<string[]>;
    };
  };
  onUpdate: (
    updater: (prev: { [id: string]: ContextSubmenuItemWithProvider[] }) => {
      [id: string]: ContextSubmenuItemWithProvider[];
    },
  ) => void;
  lastOpenFilesRef: React.MutableRefObject<ContextSubmenuItemWithProvider[]>;
}

export function buildOpenFileItems(
  withUniquePaths: { uri: string; uniquePath: string }[],
): ContextSubmenuItemWithProvider[] {
  return withUniquePaths.map((file) => ({
    id: file.uri,
    title: getUriPathBasename(file.uri),
    description: file.uniquePath,
    providerTitle: "file",
  }));
}

export function hasOpenFilesChanged(
  newFiles: ContextSubmenuItemWithProvider[],
  oldFiles: ContextSubmenuItemWithProvider[],
): boolean {
  const newIds = new Set(newFiles.map((f) => f.id));
  const oldIds = new Set(oldFiles.map((f) => f.id));
  if (newIds.size !== oldIds.size) return true;
  for (const id of newIds) {
    if (!oldIds.has(id)) return true;
  }
  for (const id of oldIds) {
    if (!newIds.has(id)) return true;
  }
  return false;
}
