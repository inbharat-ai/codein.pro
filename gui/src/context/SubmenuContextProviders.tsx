import { ContextProviderName, ContextSubmenuItemWithProvider } from "core";
import { deduplicateArray } from "core/util";
import {
  getShortestUniqueRelativeUriPaths,
  getUriPathBasename,
} from "core/util/uri";
import MiniSearch from "minisearch";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWebviewListener } from "../hooks/useWebviewListener";
import { useAppSelector } from "../redux/hooks";
import { selectSubmenuContextProviders } from "../redux/selectors";
import { IdeMessengerContext } from "./IdeMessenger";
import {
  SubmenuContextProvidersContext,
  useSubmenuContextProviders,
} from "./submenu/SubmenuContext";
import {
  buildOpenFileItems,
  hasOpenFilesChanged,
} from "./submenu/useFileSearch";
import {
  useGetSubmenuContextItems,
  useLoadSubmenuItems,
} from "./submenu/useSubmenuItems";

export { useSubmenuContextProviders };

export const SubmenuContextProvidersProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const ideMessenger = useContext(IdeMessengerContext);
  const submenuContextProviders = useAppSelector(selectSubmenuContextProviders);
  const lastProviders = useRef(submenuContextProviders);
  const disableIndexing = useAppSelector(
    (store) => store.config.config.disableIndexing,
  );

  const [minisearches, setMinisearches] = useState<{
    [id: string]: MiniSearch<ContextSubmenuItemWithProvider>;
  }>({});
  const [fallbackResults, setFallbackResults] = useState<{
    [id: string]: ContextSubmenuItemWithProvider[];
  }>({});

  const lastOpenFilesRef = useRef<ContextSubmenuItemWithProvider[]>([]);
  const providersLoading = useRef(new Set<ContextProviderName>()).current;
  const abortControllers = useRef(
    new Map<ContextProviderName, AbortController>(),
  ).current;

  // Poll open files every 2 seconds
  useEffect(() => {
    let isMounted = true;
    const refreshOpenFiles = async () => {
      if (!isMounted) return;
      const openFiles = await ideMessenger.ide.getOpenFiles();
      const workspaceDirs = await ideMessenger.ide.getWorkspaceDirs();
      const withUniquePaths = getShortestUniqueRelativeUriPaths(
        openFiles,
        workspaceDirs,
      );
      const openFileItems = buildOpenFileItems(withUniquePaths);

      if (hasOpenFilesChanged(openFileItems, lastOpenFilesRef.current)) {
        setFallbackResults((prev) => ({
          ...prev,
          file: deduplicateArray(
            [...openFileItems, ...(prev.file ?? [])],
            (a, b) => a.id === b.id,
          ),
        }));
      }
      lastOpenFilesRef.current = openFileItems;
    };

    const interval = setInterval(refreshOpenFiles, 2000);
    void refreshOpenFiles();
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [ideMessenger]);

  const getSubmenuContextItems = useGetSubmenuContextItems({
    minisearches,
    fallbackResults,
    lastOpenFilesRef,
    providersLoading,
  });

  const loadSubmenuItems = useLoadSubmenuItems({
    submenuContextProviders,
    disableIndexing,
    providersLoading,
    abortControllers,
    lastOpenFilesRef,
    ideMessenger,
    setMinisearches,
    setFallbackResults,
  });

  useWebviewListener(
    "refreshSubmenuItems",
    async (data) => {
      void loadSubmenuItems(data.providers);
    },
    [loadSubmenuItems],
  );

  // Reload submenu items when new provider titles are detected
  useEffect(() => {
    if (!submenuContextProviders.length) return;
    const newTitles = submenuContextProviders
      .filter(
        (provider) =>
          !lastProviders.current.find((p) => p.title === provider.title),
      )
      .map((provider) => provider.title);
    if (newTitles.length > 0) {
      void loadSubmenuItems(newTitles);
    }
    lastProviders.current = submenuContextProviders;
  }, [loadSubmenuItems, submenuContextProviders]);

  return (
    <SubmenuContextProvidersContext.Provider value={{ getSubmenuContextItems }}>
      {children}
    </SubmenuContextProvidersContext.Provider>
  );
};
