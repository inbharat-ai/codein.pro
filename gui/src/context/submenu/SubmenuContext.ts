import { ContextSubmenuItemWithProvider } from "core";
import { createContext, useContext } from "react";

export interface SubtextContextProvidersContextType {
  getSubmenuContextItems: (
    providerTitle: string | undefined,
    query: string,
  ) => ContextSubmenuItemWithProvider[];
}

export const initialContextProviders: SubtextContextProvidersContextType = {
  getSubmenuContextItems: () => [],
};

export const SubmenuContextProvidersContext =
  createContext<SubtextContextProvidersContextType>(initialContextProviders);

export const useSubmenuContextProviders = () =>
  useContext(SubmenuContextProvidersContext);
