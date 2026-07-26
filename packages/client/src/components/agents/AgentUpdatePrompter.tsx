import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  useDeclineCapabilityPackageUpdate,
  useInstallCapabilityPackage,
  usePendingCapabilityPackageUpdates,
} from "../../hooks/use-capability-packages";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { getPrivilegedActionErrorMessage } from "../../lib/api-client";
import { useTranslation as useUiTranslation } from "react-i18next";

export function AgentUpdatePrompter({ presentationAllowed }: { presentationAllowed: boolean }) {
  const { t: localizeUi } = useUiTranslation();
  const pendingUpdates = usePendingCapabilityPackageUpdates();
  const install = useInstallCapabilityPackage();
  const decline = useDeclineCapabilityPackageUpdate();
  const activeUpdate = useRef<string | null>(null);
  const handledUpdates = useRef(new Set<string>());

  useEffect(() => {
    const update = pendingUpdates.data?.[0];
    if (!presentationAllowed || !update) return;
    const updateKey = `${update.id}@${update.version}`;
    if (activeUpdate.current || handledUpdates.current.has(updateKey)) return;

    activeUpdate.current = updateKey;
    void (async () => {
      const confirmed = await showConfirmDialog({
        title:localizeUi("ui.agents.agentupdateprompter.agentValue1HasBeenUpdated", { value1: update.name }),
        message:localizeUi("ui.agents.agentupdateprompter.versionValue1IsAvailableApplyTheUpdateNowIf", { value1: update.version }),
        confirmLabel:localizeUi("ui.game.gamesurfacecomponent.yes"),
        cancelLabel: "No",
      });

      handledUpdates.current.add(updateKey);
      try {
        if (confirmed) {
          const installed = await install.mutateAsync({ id: update.id, expectedVersion: update.version });
          toast.success(
            installed.status === "restart-required"
              ?localizeUi("ui.agents.agentupdateprompter.value1UpdatedRestartMarinaraEngineToFinishApplyingIt", { value1: update.name })
              :localizeUi("ui.agents.agentupdateprompter.value1UpdatedAndReadyToUse", { value1: update.name }),
          );
        } else {
          await decline.mutateAsync({ id: update.id, version: update.version });
        }
      } catch (error) {
        toast.error(
          getPrivilegedActionErrorMessage(
            error,
            confirmed
              ?localizeUi("ui.agents.agentupdateprompter.value1CouldNotBeUpdatedYouCanTryAgain", { value1: update.name })
              :localizeUi("ui.agents.agentupdateprompter.value1CouldNotBeDeferred", { value1: update.name }),
          ),
        );
      } finally {
        activeUpdate.current = null;
      }
    })();
  }, [decline, install, pendingUpdates.data, presentationAllowed, localizeUi]);

  return null;
}
