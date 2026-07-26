import { useState } from "react";
import { ChevronDown, ChevronRight, Drama, RotateCcw } from "lucide-react";
import { DEFAULT_IMPERSONATE_PROMPT } from "@marinara-engine/shared";
import { useUIStore } from "../../../stores/ui.store";
import { HelpTooltip } from "../../../components/ui/HelpTooltip";
import { SettingsSwitch } from "../../../components/panels/settings/SettingControls";
import { ChatSettingsSection } from "../ChatSettingsSection";
import { useTranslation as useUiTranslation } from "react-i18next";

interface ImpersonateSectionProps {
  presets: Array<{ id: string; name: string }>;
  connections: Array<{ id: string; name: string }>;
}

export function ImpersonateSection({ presets, connections }: ImpersonateSectionProps) {
  const { t: localizeUi } = useUiTranslation();
  const promptTemplate = useUIStore((state) => state.impersonatePromptTemplate);
  const setPromptTemplate = useUIStore((state) => state.setImpersonatePromptTemplate);
  const cyoaChoices = useUIStore((state) => state.impersonateCyoaChoices);
  const setCyoaChoices = useUIStore((state) => state.setImpersonateCyoaChoices);
  const presetId = useUIStore((state) => state.impersonatePresetId);
  const setPresetId = useUIStore((state) => state.setImpersonatePresetId);
  const connectionId = useUIStore((state) => state.impersonateConnectionId);
  const setConnectionId = useUIStore((state) => state.setImpersonateConnectionId);
  const blockAgents = useUIStore((state) => state.impersonateBlockAgents);
  const setBlockAgents = useUIStore((state) => state.setImpersonateBlockAgents);
  const hasPromptTemplate = promptTemplate.trim().length > 0;
  const promptStatus = hasPromptTemplate ? "Custom" : "Chat/default";
  const [defaultOpen, setDefaultOpen] = useState(false);

  return (
    <ChatSettingsSection
      id="impersonate"
      label={localizeUi("settings.quickReplies.impersonate.label")}
      icon={<Drama size="0.875rem" />}
      help={localizeUi("ui.chatSettings.impersonatesection.globalSettingsAppliedToEveryImpersonateGenerationAcrossAll")}
    >
      <div className="space-y-2.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-xs font-semibold">{localizeUi("ui.agents.agenteditor.promptTemplate")}</span>
              <HelpTooltip text={localizeUi("ui.chatSettings.impersonatesection.optionalGlobalInstructionSentToTheModelWhenYou")} />
            </div>
            <span className="shrink-0 rounded-full bg-[var(--secondary)]/55 px-2 py-0.5 text-[0.625rem] text-[var(--muted-foreground)] ring-1 ring-[var(--border)]">
              {promptStatus}
            </span>
          </div>
          <textarea
            value={promptTemplate}
            onChange={(event) => setPromptTemplate(event.target.value)}
            placeholder={localizeUi("ui.chatSettings.impersonatesection.emptyUseChatBuiltInDefault")}
            rows={4}
            className="min-h-20 w-full resize-y rounded-lg bg-[var(--secondary)] px-3 py-1.5 font-mono text-xs leading-relaxed outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setDefaultOpen((open) => !open)}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)]/70 hover:text-[var(--foreground)]"
            >
              {defaultOpen ? <ChevronDown size="0.6875rem" /> : <ChevronRight size="0.6875rem" />}{localizeUi("ui.chat.summarypopover.builtInDefault")}</button>
            {hasPromptTemplate && (
              <button
                onClick={() => setPromptTemplate("")}
                className="flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-0.5 text-[0.625rem] text-[var(--muted-foreground)] ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                title={localizeUi("ui.agents.agenteditor.resetToDefault")}
              >
                <RotateCcw size="0.625rem" />{localizeUi("ui.characters.charactercliptrimmodal.reset")}</button>
            )}
          </div>
          {defaultOpen && (
            <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--secondary)]/40 px-3 py-2 font-mono text-[0.625rem] leading-relaxed text-[var(--muted-foreground)] ring-1 ring-[var(--border)]">
              {DEFAULT_IMPERSONATE_PROMPT}
            </pre>
          )}
        </div>

        <div className="space-y-1.5 rounded-lg bg-[var(--secondary)]/20 p-2 ring-1 ring-[var(--border)]">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.6875rem] font-semibold">{localizeUi("chat.toolbar.preset")}</span>
                <HelpTooltip text={localizeUi("ui.chatSettings.impersonatesection.useASpecificPromptPresetForRoleplayImpersonateGenerations")} />
              </div>
              <select
                value={presetId ?? ""}
                onChange={(event) => setPresetId(event.target.value || null)}
                className="w-full rounded-lg bg-[var(--secondary)] px-2.5 py-1.5 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
              >
                <option value="">{localizeUi("ui.chatSettings.impersonatesection.useChatDefault")}</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[0.6875rem] font-semibold">{localizeUi("ui.chatSettings.connectionsection.connection")}</span>
                <HelpTooltip text={localizeUi("ui.chatSettings.impersonatesection.useASpecificConnectionModelProviderForImpersonateGenerations")} />
              </div>
              <select
                value={connectionId ?? ""}
                onChange={(event) => setConnectionId(event.target.value || null)}
                className="w-full rounded-lg bg-[var(--secondary)] px-2.5 py-1.5 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
              >
                <option value="">{localizeUi("ui.chatSettings.impersonatesection.useChatDefault")}</option>
                <option value="random">{localizeUi("ui.game.gamesurfacecomponent.random")}</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-1 border-t border-[var(--border)]/60 pt-1.5">
            <SettingsSwitch
              label={localizeUi("ui.chatSettings.impersonatesection.skipAgents")}
              help={localizeUi("ui.chatSettings.impersonatesection.whenEnabledTheAgentPipelineTrackersLorebookRoutersEtc")}
              description={localizeUi("ui.chatSettings.impersonatesection.suppressTrackersRoutersAndOtherAgentWork")}
              checked={blockAgents}
              onChange={setBlockAgents}
              labelPosition="start"
              className="justify-between rounded-md px-2 py-1.5 text-left"
              labelClassName="text-xs font-semibold"
            />

            <SettingsSwitch
              label={localizeUi("ui.chatSettings.impersonatesection.useCyoaAsDirection")}
              help={localizeUi("ui.chatSettings.impersonatesection.whenEnabledClickingACyoaOptionUsesItAs")}
              description={localizeUi("ui.chatSettings.impersonatesection.treatChoicesAsImpersonateGuidance")}
              checked={cyoaChoices}
              onChange={setCyoaChoices}
              labelPosition="start"
              className="justify-between rounded-md px-2 py-1.5 text-left"
              labelClassName="text-xs font-semibold"
            />
          </div>

          <p className="border-t border-[var(--border)]/60 px-2 pt-1.5 text-[0.65rem] leading-snug text-[var(--muted-foreground)]">{localizeUi("ui.chatSettings.impersonatesection.enableQuickSendInSettingsGeneralInputEditingQuick")}</p>
        </div>
      </div>
    </ChatSettingsSection>
  );
}
