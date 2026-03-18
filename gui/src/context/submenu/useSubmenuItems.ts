import {
  ContextProviderDescription,
  ContextProviderName,
  ContextSubmenuItemWithProvider,
} from "core";
import { deduplicateArray, splitCamelCaseAndNonAlphaNumeric } from "core/util";
import MiniSearch, { SearchResult } from "minisearch";
import { useCallback } from "react";
import { IIdeMessenger } from "../../context/IdeMessenger";
import {
  useCalculateFileSortPriority,
  useCalculateMatchQuality,
} from "./useFileSearch";

const MINISEARCH_OPTIONS = {
  prefix: true,
  fuzzy: 2,
};

const MAX_LENGTH = 70;

interface EnhancedSearchResult
  extends SearchResult,
    Omit<ContextSubmenuItemWithProvider, "id"> {
  sortPriority: number;
  matchQuality: number;
}

export interface UseGetSubmenuContextItemsOptions {
  minisearches: { [id: string]: MiniSearch<ContextSubmenuItemWithProvider> };
  fallbackResults: { [id: string]: ContextSubmenuItemWithProvider[] };
  lastOpenFilesRef: React.MutableRefObject<ContextSubmenuItemWithProvider[]>;
  providersLoading: Set<ContextProviderName>;
}

export function useGetSubmenuContextItems({
  minisearches,
  fallbackResults,
  lastOpenFilesRef,
  providersLoading,
}: UseGetSubmenuContextItemsOptions) {
  const calculateFileSortPriority = useCalculateFileSortPriority();
  const calculateMatchQuality = useCalculateMatchQuality();

  return useCallback(
    (
      providerTitle: string | undefined,
      query: string,
      limit: number = MAX_LENGTH,
    ): ContextSubmenuItemWithProvider[] => {
      try {
        let searchResults: (SearchResult & ContextSubmenuItemWithProvider)[] =
          [];

        if (providerTitle === undefined) {
          searchResults = Object.keys(minisearches).flatMap((pt) =>
            minisearches[pt]
              .search(query, MINISEARCH_OPTIONS)
              .map((result) => ({
                ...result,
                providerTitle: pt,
                title: result.title,
                description: result.description,
              })),
          );
        } else {
          if (minisearches[providerTitle]) {
            searchResults = minisearches[providerTitle]
              .search(query, MINISEARCH_OPTIONS)
              .map((result) => ({
                ...result,
                providerTitle,
                title: result.title,
                description: result.description,
              }));
          }
        }

        if (
          providerTitle === "file" ||
          (!providerTitle &&
            searchResults.some((r) => r.providerTitle === "file"))
        ) {
          const enhancedResults: EnhancedSearchResult[] = searchResults.map(
            (result): EnhancedSearchResult => ({
              ...result,
              id: result.id,
              title: result.title,
              description: result.description,
              providerTitle: result.providerTitle,
              sortPriority: calculateFileSortPriority(
                result,
                query,
                lastOpenFilesRef.current,
              ),
              matchQuality: calculateMatchQuality(result, query),
            }),
          );

          enhancedResults.sort((a, b) => {
            if (a.sortPriority !== b.sortPriority)
              return a.sortPriority - b.sortPriority;
            if (a.matchQuality !== b.matchQuality)
              return b.matchQuality - a.matchQuality;
            if (a.score !== b.score) return b.score - a.score;
            return a.description.length - b.description.length;
          });

          searchResults = enhancedResults;
        } else {
          searchResults.sort((a, b) => b.score - a.score);
        }

        if (searchResults.length === 0) {
          const fallbackItems = (
            providerTitle ? (fallbackResults[providerTitle] ?? []) : []
          )
            .slice(0, limit)
            .map((result) => ({
              ...result,
              providerTitle: providerTitle || "unknown",
            }));

          if (fallbackItems.length === 0) {
            const loadingFiller = [
              {
                id: "loading",
                title: "Loading...",
                description: "Please wait while items are being loaded",
                providerTitle: providerTitle || "unknown",
              },
            ];

            if (!providerTitle) {
              if (providersLoading.size > 0) return loadingFiller;
            } else {
              if (providersLoading.has(providerTitle)) return loadingFiller;
            }
          }

          return fallbackItems;
        }

        return searchResults.slice(0, limit).map((result) => ({
          id: result.id,
          title: result.title,
          description: result.description,
          providerTitle: result.providerTitle,
        }));
      } catch {
        return [];
      }
    },
    [
      fallbackResults,
      minisearches,
      calculateFileSortPriority,
      calculateMatchQuality,
    ],
  );
}

export interface UseLoadSubmenuItemsOptions {
  submenuContextProviders: ContextProviderDescription[];
  disableIndexing: boolean | undefined;
  providersLoading: Set<ContextProviderName>;
  abortControllers: Map<ContextProviderName, AbortController>;
  lastOpenFilesRef: React.MutableRefObject<ContextSubmenuItemWithProvider[]>;
  ideMessenger: IIdeMessenger;
  setMinisearches: React.Dispatch<
    React.SetStateAction<{
      [id: string]: MiniSearch<ContextSubmenuItemWithProvider>;
    }>
  >;
  setFallbackResults: React.Dispatch<
    React.SetStateAction<{
      [id: string]: ContextSubmenuItemWithProvider[];
    }>
  >;
}

export function useLoadSubmenuItems({
  submenuContextProviders,
  disableIndexing,
  providersLoading,
  abortControllers,
  lastOpenFilesRef,
  ideMessenger,
  setMinisearches,
  setFallbackResults,
}: UseLoadSubmenuItemsOptions) {
  return useCallback(
    async (providers: "dependsOnIndexing" | "all" | ContextProviderName[]) => {
      await Promise.allSettled(
        submenuContextProviders.map(
          async (description: ContextProviderDescription) => {
            const controller = new AbortController();
            try {
              const refreshProvider =
                providers === "all"
                  ? true
                  : providers === "dependsOnIndexing"
                    ? description.dependsOnIndexing &&
                      description.dependsOnIndexing?.length > 0
                    : providers.includes(description.title);

              if (!refreshProvider) return;

              abortControllers.get(description.title)?.abort();
              abortControllers.set(description.title, controller);
              providersLoading.add(description.title);

              const result = await ideMessenger.request(
                "context/loadSubmenuItems",
                { title: description.title },
              );

              if (result.status === "error") throw new Error(result.error);

              const submenuItems = result.content;
              const providerTitle = description.title;
              const renderInlineAs = description.renderInlineAs;

              const itemsWithProvider = submenuItems.map((item) => ({
                ...item,
                providerTitle,
                renderInlineAs,
              }));

              const minisearch = new MiniSearch<ContextSubmenuItemWithProvider>(
                {
                  fields: ["title", "description"],
                  storeFields: ["id", "title", "description", "providerTitle"],
                  tokenize: (text) =>
                    deduplicateArray(
                      MiniSearch.getDefault("tokenize")(text).concat(
                        splitCamelCaseAndNonAlphaNumeric(text),
                      ),
                      (a, b) => a === b,
                    ),
                },
              );

              const deduplicatedItems = deduplicateArray(
                submenuItems.map((item) => ({ ...item, providerTitle })),
                (a, b) => a.id === b.id,
              );
              minisearch.addAll(deduplicatedItems);

              setMinisearches((prev) => ({
                ...prev,
                [providerTitle]: minisearch,
              }));

              if (providerTitle === "file") {
                setFallbackResults((prev) => ({
                  ...prev,
                  file: deduplicateArray(
                    [...lastOpenFilesRef.current, ...itemsWithProvider],
                    (a, b) => a.id === b.id,
                  ),
                }));
              } else {
                setFallbackResults((prev) => ({
                  ...prev,
                  [providerTitle]: itemsWithProvider,
                }));
              }
            } catch {
              // Submenu item loading failed for this provider
            } finally {
              if (!controller.signal.aborted) {
                providersLoading.delete(description.title);
              }
            }
          },
        ),
      );
    },
    [
      submenuContextProviders,
      disableIndexing,
      providersLoading,
      abortControllers,
    ],
  );
}
