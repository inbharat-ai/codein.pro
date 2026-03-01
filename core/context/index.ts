import type {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  ContextSubmenuItem,
  IContextProvider,
  LoadSubmenuItemsArgs,
} from "../index.js";

export abstract class BaseContextProvider implements IContextProvider {
  options: { [key: string]: any };

  constructor(options: { [key: string]: any }) {
    this.options = options;
  }

  static description: ContextProviderDescription;

  get description(): ContextProviderDescription {
    return (this.constructor as any).description;
  }

  // Maybe just include the chat message in here. Should never have to go back to the context provider once you have the information.
  abstract getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]>;

  async loadSubmenuItems(
    args: LoadSubmenuItemsArgs,
  ): Promise<ContextSubmenuItem[]> {
    return [];
  }

  get deprecationMessage(): string | null {
    return null;
  }
}

// Context intelligence exports
export { routeFromBudget, routeWithContext } from "./ContextAwareRouter.js";
export type {
  ContextRoutingConfig,
  ContextRoutingDecision,
} from "./ContextAwareRouter.js";
export { ContextBudgetManager } from "./ContextBudgetManager.js";
export type {
  BudgetAllocation,
  BudgetUtilization,
  ContextBudgetConfig,
} from "./ContextBudgetManager.js";
export { pruneByRelevance, scoreMessages } from "./RelevancePruner.js";
export type { PruneResult, ScoredMessage } from "./RelevancePruner.js";

// Multi-file reasoning
export { MultiFileReasoningEngine } from "./MultiFileReasoningEngine.js";
export type {
  ChangeImpact,
  CrossReference,
  DependencyGraph,
  FileNode,
  ImportEdge,
  RankedFile,
  ReasoningContext,
} from "./MultiFileReasoningEngine.js";
