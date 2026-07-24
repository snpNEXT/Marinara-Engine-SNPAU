import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  useDeclineCapabilityPackageUpdate,
  useInstallCapabilityPackage,
  usePendingCapabilityPackageUpdates,
} from "../../hooks/use-capability-packages";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { getPrivilegedActionErrorMessage } from "../../lib/api-client";

export function AgentUpdatePrompter({ presentationAllowed }: { presentationAllowed: boolean }) {
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
        title: `Agent ${update.name} has been updated`,
        message: `Version ${update.version} is available. Apply the update now? If you choose No, you can update it later in Download Agents.`,
        confirmLabel: "Yes",
        cancelLabel: "No",
      });

      handledUpdates.current.add(updateKey);
      try {
        if (confirmed) {
          const installed = await install.mutateAsync({ id: update.id, expectedVersion: update.version });
          toast.success(
            installed.status === "restart-required"
              ? `${update.name} updated. Restart Marinara Engine to finish applying it.`
              : `${update.name} updated and ready to use.`,
          );
        } else {
          await decline.mutateAsync({ id: update.id, version: update.version });
        }
      } catch (error) {
        toast.error(
          getPrivilegedActionErrorMessage(
            error,
            confirmed
              ? `${update.name} could not be updated. You can try again in Download Agents.`
              : `${update.name} could not be deferred.`,
          ),
        );
      } finally {
        activeUpdate.current = null;
      }
    })();
  }, [decline, install, pendingUpdates.data, presentationAllowed]);

  return null;
}
