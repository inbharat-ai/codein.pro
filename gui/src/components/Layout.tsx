import { OnboardingModes } from "core/protocol/core";
import { useContext, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "../context/Auth";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { LocalStorageProvider } from "../context/LocalStorage";
import TelemetryProviders from "../hooks/TelemetryProviders";
import { useWebviewListener } from "../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setCodeToEdit } from "../redux/slices/editState";
import { setDialogMessage, setShowDialog } from "../redux/slices/uiSlice";
import { enterEdit, exitEdit } from "../redux/thunks/edit";
import { saveCurrentSession } from "../redux/thunks/session";
import { fontSize, isMetaEquivalentKeyPressed } from "../util";
import { ROUTES } from "../util/navigation";
import { FatalErrorIndicator } from "./config/FatalErrorNotice";
import TextDialog from "./dialogs";
import { GenerateRuleDialog } from "./GenerateRuleDialog";
import { IdeShell } from "./IdeShell";
import { useMainEditor } from "./mainInput/TipTapEditor";
import {
  isNewUserOnboarding,
  OnboardingCard,
  useOnboardingCard,
} from "./OnboardingCard";
import OSRContextMenu from "./OSRContextMenu";
import PostHogPageView from "./PosthogPageView";

function useLayoutWebviewListeners() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const onboardingCard = useOnboardingCard();
  const ideMessenger = useContext(IdeMessengerContext);
  const { mainEditor } = useMainEditor();
  const isInEdit = useAppSelector((store) => store.session.isInEdit);
  const isHome =
    location.pathname === ROUTES.HOME ||
    location.pathname === ROUTES.HOME_INDEX;

  useWebviewListener(
    "newSession",
    async () => {
      navigate(ROUTES.HOME);
      if (isInEdit) {
        await dispatch(exitEdit({}));
      } else {
        await dispatch(
          saveCurrentSession({
            openNewSession: true,
            generateTitle: true,
          }),
        );
      }
    },
    [isInEdit],
  );

  useWebviewListener(
    "isContinueInputFocused",
    async () => {
      return false;
    },
    [isHome],
    isHome,
  );

  useWebviewListener(
    "focusContinueInputWithNewSession",
    async () => {
      navigate(ROUTES.HOME);
      if (isInEdit) {
        await dispatch(
          exitEdit({
            openNewSession: true,
          }),
        );
      } else {
        await dispatch(
          saveCurrentSession({
            openNewSession: true,
            generateTitle: true,
          }),
        );
      }
    },
    [isHome, isInEdit],
    isHome,
  );

  useWebviewListener(
    "addModel",
    async () => {
      navigate("/models");
    },
    [navigate],
  );

  useWebviewListener(
    "navigateTo",
    async (data) => {
      if (data.toggle && location.pathname === data.path) {
        navigate("/");
      } else {
        navigate(data.path);
      }
    },
    [location, navigate],
  );

  useWebviewListener(
    "setupLocalConfig",
    async () => {
      onboardingCard.open(OnboardingModes.LOCAL);
    },
    [],
  );

  useWebviewListener(
    "freeTrialExceeded",
    async () => {
      dispatch(setShowDialog(true));
      onboardingCard.setActiveTab(OnboardingModes.MODELS_ADD_ON);
      dispatch(
        setDialogMessage(
          <div className="flex-1">
            <OnboardingCard isDialog />
          </div>,
        ),
      );
    },
    [],
  );

  useWebviewListener(
    "setupApiKey",
    async () => {
      onboardingCard.open(OnboardingModes.API_KEY);
    },
    [],
  );

  useWebviewListener(
    "focusEdit",
    async () => {
      await ideMessenger.request("edit/addCurrentSelection", undefined);
      await dispatch(enterEdit({ editorContent: mainEditor?.getJSON() }));
      mainEditor?.commands.focus();
    },
    [ideMessenger, mainEditor],
  );

  useWebviewListener(
    "setCodeToEdit",
    async (payload) => {
      dispatch(
        setCodeToEdit({
          codeToEdit: payload,
        }),
      );
    },
    [],
  );

  useWebviewListener(
    "exitEditMode",
    async () => {
      await dispatch(exitEdit({}));
    },
    [],
  );

  useWebviewListener(
    "generateRule",
    async () => {
      dispatch(setShowDialog(true));
      dispatch(setDialogMessage(<GenerateRuleDialog />));
    },
    [],
  );

  return { isHome, onboardingCard };
}

const Layout = () => {
  const [showStagingIndicator, setShowStagingIndicator] = useState(false);
  const location = useLocation();
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);

  const dialogMessage = useAppSelector((state) => state.ui.dialogMessage);
  const showDialog = useAppSelector((state) => state.ui.showDialog);
  const isHome =
    location.pathname === ROUTES.HOME ||
    location.pathname === ROUTES.HOME_INDEX;

  const { onboardingCard } = useLayoutWebviewListeners();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await ideMessenger.request(
        "controlPlane/getEnvironment",
        undefined,
      );
      if (!cancelled && response.status === "success") {
        setShowStagingIndicator(response.content.AUTH_TYPE.includes("staging"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: any) => {
      if (isMetaEquivalentKeyPressed(event) && event.code === "KeyC") {
        const selection = window.getSelection()?.toString();
        if (selection) {
          setTimeout(() => {
            void navigator.clipboard.writeText(selection);
          }, 100);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isNewUserOnboarding() && isHome) {
      onboardingCard.open();
    }
  }, [isHome]);

  return (
    <LocalStorageProvider>
      <AuthProvider>
        <TelemetryProviders>
          <IdeShell>
            <div className="codin-geo-bg">
              <div className="codin-layout-top">
                {showStagingIndicator && (
                  <span
                    title="Staging environment"
                    className="absolute right-0 mx-1.5 h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: "var(--codin-saffron-500, #f59e0b)",
                    }}
                  />
                )}
                <OSRContextMenu />
                <div
                  style={{
                    scrollbarGutter: "stable both-edges",
                    minHeight: "100%",
                    display: "grid",
                    gridTemplateRows: "1fr auto",
                  }}
                >
                  <TextDialog
                    showDialog={showDialog}
                    onEnter={() => {
                      dispatch(setShowDialog(false));
                    }}
                    onClose={() => {
                      dispatch(setShowDialog(false));
                    }}
                    message={dialogMessage}
                  />

                  <div className="codin-grid-div">
                    <PostHogPageView />
                    <div
                      key={location.pathname}
                      className="codin-page-transition"
                    >
                      <Outlet />
                    </div>
                    {/* The fatal error for chat is shown below input */}
                    {!isHome && <FatalErrorIndicator />}
                  </div>
                </div>
                <div
                  style={{ fontSize: fontSize(-4) }}
                  id="tooltip-portal-div"
                />
              </div>
            </div>
          </IdeShell>
        </TelemetryProviders>
      </AuthProvider>
    </LocalStorageProvider>
  );
};

export default Layout;
