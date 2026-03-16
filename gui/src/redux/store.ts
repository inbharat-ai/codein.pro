import {
  combineReducers,
  configureStore,
  ThunkDispatch,
  UnknownAction,
} from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import {
  createMigrate,
  MigrationManifest,
  persistReducer,
  persistStore,
} from "redux-persist";
import { createFilter } from "redux-persist-transform-filter";
import autoMergeLevel2 from "redux-persist/lib/stateReconciler/autoMergeLevel2";
import storage from "redux-persist/lib/storage";
import { IdeMessenger, IIdeMessenger } from "../context/IdeMessenger";
import configReducer from "./slices/configSlice";
import editModeStateReducer from "./slices/editState";
import indexingReducer from "./slices/indexingSlice";
import { profilesReducer } from "./slices/profilesSlice";
import sessionReducer from "./slices/sessionSlice";
import swarmReducer from "./slices/swarmSlice";
import aiHubReducer from "./slices/aiHubSlice";
import computerReducer from "./slices/computerSlice";
import tabsReducer from "./slices/tabsSlice";
import uiReducer from "./slices/uiSlice";

const rootReducer = combineReducers({
  session: sessionReducer,
  ui: uiReducer,
  editModeState: editModeStateReducer,
  config: configReducer,
  indexing: indexingReducer,
  tabs: tabsReducer,
  profiles: profilesReducer,
  swarm: swarmReducer,
  aiHub: aiHubReducer,
  computer: computerReducer,
});

const saveSubsetFilters = [
  createFilter("session", [
    "id",
    "lastSessionId",
    "title",

    // Persist edit mode in case closes in middle
    "mode",

    // Persist chat history across restarts (pruned to last 50 messages in migration)
    "history",
  ]),
  createFilter("editModeState", [
    "returnToMode",
    "lastNonEditSessionWasEmpty",
    "codeToEdit",
  ]),
  createFilter("config", []),
  createFilter("ui", [
    "toolSettings",
    "toolGroupSettings",
    "ruleSettings",
    "reasoningSettings",
  ]),
  createFilter("indexing", []),
  createFilter("tabs", ["tabs"]),
  createFilter("profiles", [
    "preferencesByProfileId",
    "selectedProfileId",
    "selectedOrganizationId",
    "organizations",
  ]),
];

const MAX_PERSISTED_HISTORY = 50;

const migrations: MigrationManifest = {
  "0": (state) => {
    const oldState = state as Record<string, unknown> | undefined;
    const oldInnerState = oldState?.["state"] as
      | Record<string, unknown>
      | undefined;

    return {
      config: {
        defaultModelTitle: oldInnerState?.["defaultModelTitle"] ?? undefined,
      },
      session: {
        id: oldInnerState?.["sessionId"] ?? "",
      },
      tabs: {
        tabs: [
          {
            id:
              Date.now().toString(36) + Math.random().toString(36).substring(2),
            title: "Chat 1",
            isActive: true,
          },
        ],
      },
      _persist: oldState?.["_persist"],
    };
  },
  "2": (state) => {
    const oldState = state as Record<string, unknown> | undefined;
    const oldSession = oldState?.["session"] as
      | Record<string, unknown>
      | undefined;
    // Prune history to last 50 messages and strip non-serializable fields
    const history = Array.isArray(oldSession?.["history"])
      ? (oldSession["history"] as unknown[]).slice(-MAX_PERSISTED_HISTORY)
      : [];

    return {
      ...oldState,
      session: {
        ...oldSession,
        history,
        // Reset streaming state on migration — can't be mid-stream across restart
        isStreaming: false,
        streamAborter: undefined,
      },
    };
  },
};

const persistConfig = {
  version: 2,
  key: "root",
  storage,
  transforms: [...saveSubsetFilters],
  stateReconciler: autoMergeLevel2,
  migrate: createMigrate(migrations, { debug: false }),
};

const persistedReducer = persistReducer<ReturnType<typeof rootReducer>>(
  persistConfig,
  rootReducer,
);

export function setupStore(options: { ideMessenger?: IIdeMessenger }) {
  const ideMessenger = options.ideMessenger ?? new IdeMessenger();

  const logger = createLogger({
    // Customize logger options if needed
    collapsed: true, // Collapse console groups by default
    timestamp: false, // Remove timestamps from log
    diff: true, // Show diff between states
  });

  return configureStore({
    // persistedReducer causes type errors with async thunks
    reducer: persistedReducer as unknown as typeof rootReducer,
    // reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: {
          extraArgument: {
            ideMessenger,
          },
        },
      }),
    // This can be uncommented to get detailed Redux logs
    // .concat(logger),
  });
}

export type ThunkExtrasType = { ideMessenger: IIdeMessenger };

export type ThunkApiType = {
  state: RootState;
  extra: ThunkExtrasType;
};

export type AppThunkDispatch = ThunkDispatch<
  RootState,
  ThunkExtrasType,
  UnknownAction
>;

export const store = setupStore({});

export type RootState = ReturnType<typeof rootReducer>;

export type AppDispatch = typeof store.dispatch;

export const persistor = persistStore(store);
