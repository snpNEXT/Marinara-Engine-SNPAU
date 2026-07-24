// ──────────────────────────────────────────────
// Noodle: fake social media timeline
// ──────────────────────────────────────────────
import {
  AtSign,
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Dices,
  FileText,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Smile,
  Trash2,
  X,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
} from "react";
import { toast } from "sonner";
import {
  noodleTextMentionsHandle as textMentionsHandle,
  PROFESSOR_MARI_ID,
  type NoodleTextMention,
  type APIConnection,
  type NoodleAccount,
  type NoodleCarryoverTarget,
  type NoodleInteraction,
  type NoodleInteractionType,
  type NoodlePost,
  type NoodlePollInput,
  type NoodleRefreshSchedulerStatus,
  type NoodleSettingsUpdateInput,
} from "@marinara-engine/shared";
import { cn, parseAvatarCropJson, type AvatarCropValue } from "../../lib/utils";
import { useActivePersona, useCharacterGroups, useCharacters, usePersonas } from "../../hooks/use-characters";
import { useConnections } from "../../hooks/use-connections";
import { useNoodleCustomEmojiMap } from "../../hooks/use-noodle-custom-emojis";
import {
  usePromptOverride,
  usePromptOverrideDefault,
  useResetPromptOverride,
  useSavePromptOverride,
} from "../../hooks/use-prompt-overrides";
import { useUploadGlobalGalleryImages } from "../../hooks/use-global-gallery";
import type { ChatImage } from "../../hooks/use-gallery";
import { HelpTooltip } from "../ui/HelpTooltip";
import {
  ConversationMediaPickerPanel,
  type ConversationMediaPickerTab,
  type ConversationMediaPickerTabId,
} from "../chat/ConversationMediaPickerPanel";
import { ChatImageLightbox } from "../chat/ChatImageLightbox";
import { ExpandedTextarea } from "../ui/ExpandedTextarea";
import { Modal } from "../ui/Modal";
import {
  ImagePromptReviewModal,
  type ImagePromptOverride,
  type ImagePromptReviewItem,
} from "../ui/ImagePromptReviewModal";
import {
  useConfirmNoodleImagePrompts,
  useClearNoodleInvites,
  useCreateNoodleInteraction,
  useCreateNoodlePost,
  useDeleteNoodleInteraction,
  useDeleteNoodlePost,
  useInviteNoodleCharacter,
  useInviteNoodleCharacters,
  useNoodle,
  useNoodlerAccounts,
  usePatchNoodleAccountSettings,
  useRefreshNoodle,
  useRemoveNoodleCharacter,
  useRemoveNoodleInteraction,
  useRescheduleNoodleRefresh,
  useResetNoodleTimeline,
  useUpdateNoodleAccountFollow,
  useUpdateNoodleAccountProfile,
  useUpdateNoodleInteraction,
  useUpdateNoodlePost,
  useUpdateNoodleSettings,
} from "../../hooks/use-noodle";
import { useUIStore } from "../../stores/ui.store";
import {
  Avatar,
  NoodleLogo,
  NoodleShell,
  NOODLE_BLUE,
  NOODLE_ICON_SCOPE_CLASS,
  NOODLE_PERSONA_SWITCHER_PAGE_SIZE,
} from "./NoodleShell";
import type {
  NoodleNavigationState,
  NoodleProfileConnection,
} from "./noodle-navigation.types";
import { NoodleProfileSurface } from "./NoodleProfileSurface";
import { BrowserChrome, formatTime } from "./NoodleBrowserChrome";
import {
  insertAtSelection,
  NoodleAnchoredPopover,
  NoodleComposerShell,
  NoodleComposerToolRow,
  NoodleCustomEmojiText,
  NoodleMentionSuggestions,
  NoodlePostCard,
  type NoodlePostCardModel,
  noodleIconButtonClass,
  NoodleToolButton,
  NoodleToolPopover,
} from "./NoodlePostCard";

type RawCharacter = { id?: unknown; data?: unknown; avatarPath?: unknown };
type RawCharacterGroup = { id?: unknown; name?: unknown; description?: unknown; characterIds?: unknown };
type RawPersona = { id?: unknown; createdAt?: unknown; updatedAt?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRawCharacter(value: unknown): value is RawCharacter {
  return isRecord(value);
}

function isRawCharacterGroup(value: unknown): value is RawCharacterGroup {
  return isRecord(value);
}

function isRawPersona(value: unknown): value is RawPersona {
  return isRecord(value);
}

function isConnection(value: unknown): value is Partial<APIConnection> {
  return isRecord(value);
}

const fieldClass =
  "mari-chrome-field h-9 w-full min-w-0 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 text-xs text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
const textareaClass =
  "mari-chrome-field min-h-24 w-full min-w-0 resize-y rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
const labelClass =
  "text-[0.68rem] font-semibold uppercase tracking-normal text-[var(--marinara-chat-chrome-panel-muted)]";
const NOODLE_INVITE_PAGE_SIZE = 50;
const NOODLE_MENTION_SUGGESTION_LIMIT = 8;
const NOODLE_CARRYOVER_TARGETS: NoodleCarryoverTarget[] = ["conversation", "roleplay", "game"];
const NOODLE_TIMELINE_BASE_PROMPT_KEY = "noodle.timelineBase";
const NOODLE_MEDIA_PICKER_TABS: ConversationMediaPickerTab[] = [
  { id: "emoji", label: "Emoji" },
  { id: "gifs", label: "GIFs" },
  { id: "stickers", label: "Stickers" },
];

type ComposerTool = "image" | "poll" | "media";
type ReplyComposerTool = "image" | "media";
type ProfileTab = "posts" | "likes" | "media";
type ProfileConnectionTab = NoodleProfileConnection;
type NotificationTab = "likes" | "follows" | "replies";
type TimelineTab = "main" | "following";
type NoodleNotificationFocusTarget = {
  postId: string;
  interactionId: string | null;
};
type ActiveComposerMention = NoodleTextMention & { query: string };
type NoodleConfirmAction =
  | {
      kind: "delete-post";
      postId: string;
      title: string;
      message: string;
      confirmLabel: string;
    }
  | {
      kind: "reset-timeline";
      title: string;
      message: string;
      confirmLabel: string;
    }
  | {
      kind: "uninvite-everybody";
      title: string;
      message: string;
      confirmLabel: string;
    }
  | {
      kind: "delete-reply";
      postId: string;
      interactionId: string;
      title: string;
      message: string;
      confirmLabel: string;
    };

const TIMELINE_TABS: Array<{ id: TimelineTab; label: string }> = [
  { id: "main", label: "Main" },
  { id: "following", label: "Following" },
];

const PROFILE_CONNECTION_TABS: Array<{ id: ProfileConnectionTab; label: string }> = [
  { id: "followers", label: "Followers" },
  { id: "following", label: "Following" },
];

const NOTIFICATION_TABS: Array<{ id: NotificationTab; label: string }> = [
  { id: "likes", label: "Likes" },
  { id: "follows", label: "Follows" },
  { id: "replies", label: "Replies" },
];

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(value) ? value : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function carryoverTargetsFromLegacy(mode: string | undefined): NoodleCarryoverTarget[] {
  if (mode === "all") return [...NOODLE_CARRYOVER_TARGETS];
  if (mode === "conversation" || mode === "roleplay" || mode === "game") return [mode];
  return [];
}

function legacyCarryoverModeFromTargets(targets: NoodleCarryoverTarget[]): NoodleSettingsUpdateInput["carryoverMode"] {
  const selected = new Set(targets);
  if (NOODLE_CARRYOVER_TARGETS.every((target) => selected.has(target))) return "all";
  if (targets.length === 1) return targets[0]!;
  return "off";
}

function readAccountSetting(account: NoodleAccount | null, key: keyof NoodleAccount["settings"]["profile"]) {
  return readString(account?.settings.profile[key]).trim();
}

function readAccountSettingBoolean(account: NoodleAccount | null, key: keyof NoodleAccount["settings"]["profile"]) {
  const value = account?.settings.profile[key];
  return value === true || value === "true";
}

function hasGeneratedProfile(account: NoodleAccount | null) {
  return readAccountSettingBoolean(account, "profileGenerated");
}

function sortAccountsByDisplayName(left: NoodleAccount, right: NoodleAccount) {
  return left.displayName.localeCompare(right.displayName) || left.handle.localeCompare(right.handle);
}

function accountTimestamp(account: NoodleAccount) {
  return Date.parse(account.updatedAt || account.createdAt) || 0;
}

function uniqueAccountsById(accounts: Array<NoodleAccount | null | undefined>) {
  const seen = new Set<string>();
  const result: NoodleAccount[] = [];
  for (const account of accounts) {
    if (!account || seen.has(account.id)) continue;
    seen.add(account.id);
    result.push(account);
  }
  return result;
}

function extractAccountSearchTerm(query: string) {
  const match = query.match(/@([a-zA-Z0-9_.-]*)/);
  return match ? match[1]!.toLowerCase() : "";
}

function accountMatchesSearch(account: NoodleAccount, term: string) {
  if (!term) return true;
  return [account.handle, account.displayName, account.bio].some((value) => value.toLowerCase().includes(term));
}

function activeComposerMention(value: string, caret: number): ActiveComposerMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]*)$/u.exec(beforeCaret);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length - 1;
  return { handle: query.toLowerCase(), query: query.toLowerCase(), start, end: caret };
}

function matchingMentionAccounts(accounts: NoodleAccount[], activeMention: ActiveComposerMention | null) {
  if (!activeMention) return [];
  return accounts
    .filter((account) => account.handle.toLowerCase().startsWith(activeMention.query))
    .sort((left, right) => left.handle.localeCompare(right.handle))
    .slice(0, NOODLE_MENTION_SUGGESTION_LIMIT);
}

function characterName(character: RawCharacter) {
  const data = parseRecord(character.data);
  return readString(data.name).trim() || "Character";
}

function rawCharacterAvatarCrop(character: RawCharacter): AvatarCropValue | null {
  const raw = parseRecord(parseRecord(character.data).extensions).avatarCrop;
  if (typeof raw === "string") return parseAvatarCropJson(raw);
  try {
    return raw ? parseAvatarCropJson(JSON.stringify(raw)) : null;
  } catch {
    return null;
  }
}

function characterGroupName(group: RawCharacterGroup) {
  return readString(group.name).trim() || "Character folder";
}

function formatNoodleRefreshTime(value: string | null, timezone?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      ...(timezone && timezone !== "local" ? { timeZone: timezone } : {}),
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  }
}

function formatNoodleRefreshTimeInput(value: string, timezone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      ...(timezone && timezone !== "local" ? { timeZone: timezone } : {}),
    }).formatToParts(date);
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : "";
  } catch {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
}

function noodleSchedulerSummary(scheduler: NoodleRefreshSchedulerStatus) {
  if (scheduler.state === "disabled") return "Automatic refreshes are off.";
  if (scheduler.state === "completed") return "Today's automatic refreshes are complete.";
  if (scheduler.state === "retrying") {
    const retryTime = formatNoodleRefreshTime(scheduler.nextAttemptAt, scheduler.timezone);
    return retryTime ? `Waiting to retry at ${retryTime}.` : "Waiting to retry.";
  }
  if (scheduler.state === "due") return "An automatic refresh is due now.";
  const nextTime = formatNoodleRefreshTime(scheduler.nextRefreshAt, scheduler.timezone);
  return nextTime ? `Next automatic refresh at ${nextTime}.` : "Automatic refresh is scheduled.";
}

function MobileTimelineBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 lg:hidden"
      title="Back to timeline"
      aria-label="Back to Noodle timeline"
    >
      <ChevronLeft size={22} />
    </button>
  );
}

function FieldLabel({ children, help }: { children: React.ReactNode; help?: React.ReactNode }) {
  return (
    <span className={cn(labelClass, "inline-flex items-center gap-1")}>
      {children}
      {help && <HelpTooltip text={help} side="top" wide />}
    </span>
  );
}

function Section({ title, help, children }: { title: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-[var(--noodle-divider)] p-4 last:border-b-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
        <Settings2 size={13} className="text-[var(--noodle-blue)]" />
        {title}
        {help && <HelpTooltip text={help} side="bottom" wide />}
      </h3>
      {children}
    </section>
  );
}

function ToggleSetting({
  label,
  help,
  checked,
  disabled,
  compact = false,
  onChange,
}: {
  label: string;
  help?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  compact?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] py-2 text-xs",
        compact ? "gap-2 px-1.5" : "gap-3 px-3",
      )}
    >
      <span
        className={cn(
          "inline-flex min-w-0 items-center gap-1 font-semibold",
          compact && "flex-1",
        )}
      >
        <span className={cn(compact && "min-w-0 truncate text-[10px] leading-none")}>{label}</span>
        {help && <HelpTooltip text={help} side="top" wide />}
      </span>
      <input
        className="shrink-0"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

type NoodleHomeNavigation = Extract<NoodleNavigationState, { mode: "public" | "settings" }>;

interface NoodleHomeProps {
  navigation: NoodleHomeNavigation;
  onNavigate: (destination: NoodleNavigationState) => void;
}

export function NoodleHome({ navigation, onNavigate }: NoodleHomeProps) {
  const selectedPersonaId = useUIStore((state) => state.noodleSelectedPersonaId) ?? "";
  const setSelectedPersonaId = useUIStore((state) => state.setNoodleSelectedPersonaId);
  const { data, isLoading, isError } = useNoodle();
  const noodlerAccountsQuery = useNoodlerAccounts(data?.settings.enableNoodler === true);
  const { data: activePersona } = useActivePersona();
  const { data: personasRaw } = usePersonas();
  const { data: charactersRaw } = useCharacters();
  const { data: characterGroupsRaw } = useCharacterGroups();
  const { data: connectionsRaw } = useConnections();
  const updateSettings = useUpdateNoodleSettings();
  const updateAccountFollow = useUpdateNoodleAccountFollow();
  const updateAccountProfile = useUpdateNoodleAccountProfile();
  const patchAccountSettings = usePatchNoodleAccountSettings();
  const inviteCharacter = useInviteNoodleCharacter();
  const inviteCharacters = useInviteNoodleCharacters();
  const clearInvites = useClearNoodleInvites();
  const removeCharacter = useRemoveNoodleCharacter();
  const createPost = useCreateNoodlePost();
  const updatePost = useUpdateNoodlePost();
  const deletePost = useDeleteNoodlePost();
  const createInteraction = useCreateNoodleInteraction();
  const removeInteraction = useRemoveNoodleInteraction();
  const updateInteraction = useUpdateNoodleInteraction();
  const deleteInteraction = useDeleteNoodleInteraction();
  const rescheduleRefresh = useRescheduleNoodleRefresh();
  const refreshNoodle = useRefreshNoodle();
  const confirmNoodleImagePrompts = useConfirmNoodleImagePrompts();
  const resetNoodleTimeline = useResetNoodleTimeline();
  const noodlePromptDetail = usePromptOverride(NOODLE_TIMELINE_BASE_PROMPT_KEY);
  const noodlePromptDefault = usePromptOverrideDefault(NOODLE_TIMELINE_BASE_PROMPT_KEY);
  const saveNoodlePrompt = useSavePromptOverride();
  const resetNoodlePrompt = useResetPromptOverride();
  const uploadGlobalImages = useUploadGlobalGalleryImages();
  const prefersReducedMotion = useReducedMotion();
  const imageFileRef = useRef<HTMLInputElement | null>(null);
  const inlineComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const modalComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const composerValueRef = useRef("");
  const composerHasTextRef = useRef(false);
  const replyValueRef = useRef("");
  const replyHasTextRef = useRef(false);
  const replyImageFileRef = useRef<HTMLInputElement | null>(null);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const imageToolRef = useRef<HTMLDivElement | null>(null);
  const pollToolRef = useRef<HTMLDivElement | null>(null);
  const mediaToolRef = useRef<HTMLDivElement | null>(null);
  const modalImageToolRef = useRef<HTMLDivElement | null>(null);
  const modalPollToolRef = useRef<HTMLDivElement | null>(null);
  const modalMediaToolRef = useRef<HTMLDivElement | null>(null);
  const replyImageToolRef = useRef<HTMLDivElement | null>(null);
  const replyMediaToolRef = useRef<HTMLDivElement | null>(null);
  const accountSwitcherRef = useRef<HTMLDivElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileDrawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerRestoreFocusRef = useRef<HTMLElement | null>(null);
  const profileDraftAccountIdRef = useRef<string | null>(null);
  const notificationReadEntryRef = useRef<string | null>(null);

  const characters = useMemo(
    () => (Array.isArray(charactersRaw) ? charactersRaw.filter(isRawCharacter) : []),
    [charactersRaw],
  );
  const personas = useMemo(() => (Array.isArray(personasRaw) ? personasRaw.filter(isRawPersona) : null), [personasRaw]);
  const characterGroups = useMemo(
    () => (Array.isArray(characterGroupsRaw) ? characterGroupsRaw.filter(isRawCharacterGroup) : []),
    [characterGroupsRaw],
  );
  const allConnections = useMemo(
    () => (Array.isArray(connectionsRaw) ? connectionsRaw.filter(isConnection) : []),
    [connectionsRaw],
  );
  const connections = useMemo(
    () =>
      allConnections.filter(
        (connection) => connection.provider !== "image_generation" && connection.provider !== "video_generation",
      ),
    [allConnections],
  );
  const imageConnections = useMemo(
    () => allConnections.filter((connection) => connection.provider === "image_generation"),
    [allConnections],
  );

  const [composer, setComposer] = useState("");
  const [composerHasText, setComposerHasText] = useState(false);
  const [activeMention, setActiveMention] = useState<ActiveComposerMention | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [postSearch, setPostSearch] = useState("");
  const [profileHandle, setProfileHandle] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileBannerUrl, setProfileBannerUrl] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileUploadTarget, setProfileUploadTarget] = useState<"avatar" | "banner" | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("posts");
  const [notificationTab, setNotificationTab] = useState<NotificationTab>("likes");
  const [timelineTab, setTimelineTab] = useState<TimelineTab>("main");
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteFoldersOpen, setInviteFoldersOpen] = useState(false);
  const [inviteCharacterLimit, setInviteCharacterLimit] = useState(NOODLE_INVITE_PAGE_SIZE);
  const [replyPostId, setReplyPostId] = useState<string | null>(null);
  const [replyParentInteractionId, setReplyParentInteractionId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyHasText, setReplyHasText] = useState(false);
  const [activeReplyMention, setActiveReplyMention] = useState<ActiveComposerMention | null>(null);
  const [activeReplyMentionIndex, setActiveReplyMentionIndex] = useState(0);
  const [replyImageUrl, setReplyImageUrl] = useState("");
  const [replyImageUrlDraft, setReplyImageUrlDraft] = useState("");
  const [activeReplyComposerTool, setActiveReplyComposerTool] = useState<ReplyComposerTool | null>(null);
  const [imageLightbox, setImageLightbox] = useState<ChatImage | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NoodleNotificationFocusTarget | null>(null);
  const [highlightedInteractionId, setHighlightedInteractionId] = useState<string | null>(null);
  const [notificationReadOverrides, setNotificationReadOverrides] = useState<Record<string, string>>({});
  const [editingRefreshTime, setEditingRefreshTime] = useState<string | null>(null);
  const [refreshTimeDraft, setRefreshTimeDraft] = useState("");
  const [imagePromptReviewItems, setImagePromptReviewItems] = useState<ImagePromptReviewItem[]>([]);
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyContent, setEditingReplyContent] = useState("");
  const [confirmAction, setConfirmAction] = useState<NoodleConfirmAction | null>(null);
  const [noodlePromptEditorOpen, setNoodlePromptEditorOpen] = useState(false);
  const [noodlePromptDraft, setNoodlePromptDraft] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileAccountSwitcherOpen, setMobileAccountSwitcherOpen] = useState(false);
  const [personaAccountLimit, setPersonaAccountLimit] = useState(NOODLE_PERSONA_SWITCHER_PAGE_SIZE);
  const [activeComposerTool, setActiveComposerTool] = useState<ComposerTool | null>(null);
  const [mediaPickerTab, setMediaPickerTab] = useState<ConversationMediaPickerTabId>("emoji");
  const [attachedImageUrl, setAttachedImageUrl] = useState("");
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [imageGenerationPromptDraft, setImageGenerationPromptDraft] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [draftPoll, setDraftPoll] = useState<NoodlePollInput | null>(null);

  const activeNoodleView = navigation.mode === "public" ? navigation.view : navigation.mode;
  const viewedProfileAccountId = navigation.mode === "public" && navigation.view === "profile" ? navigation.accountId : null;
  const profileConnectionTab =
    navigation.mode === "public" && navigation.view === "profile" ? navigation.connection : null;

  const noodlePromptOverride = noodlePromptDetail.data?.override ?? null;
  const noodleDefaultPromptText = noodlePromptDefault.data?.template ?? "";
  const noodlePromptText =
    noodlePromptOverride?.enabled === true ? noodlePromptOverride.template : noodleDefaultPromptText;
  const noodlePromptHasOverride = noodlePromptOverride?.enabled === true;
  const noodlePromptLoading = noodlePromptDetail.isLoading || noodlePromptDefault.isLoading;
  const noodlePromptDirty = noodlePromptDraft !== noodlePromptText;
  const settings = data?.settings;
  const accounts = useMemo(
    () =>
      (data?.accounts ?? []).filter(
        (account) =>
          (settings?.allowProfessorMari ?? true) ||
          account.kind !== "character" ||
          account.entityId !== PROFESSOR_MARI_ID,
      ),
    [data?.accounts, settings?.allowProfessorMari],
  );
  const livePersonaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const persona of personas ?? []) {
      const id = readString(persona.id);
      if (id) ids.add(id);
    }
    return ids;
  }, [personas]);
  const personaRecencyById = useMemo(() => {
    const recency = new Map<string, number>();
    for (const persona of personas ?? []) {
      const id = readString(persona.id);
      if (!id) continue;
      recency.set(id, Date.parse(readString(persona.updatedAt) || readString(persona.createdAt)) || 0);
    }
    return recency;
  }, [personas]);
  const personaAccounts = useMemo(
    () =>
      accounts.filter(
        (account) => account.kind === "persona" && (personas === null || livePersonaIds.has(account.entityId)),
      ),
    [accounts, livePersonaIds, personas],
  );
  const sortedPersonaAccounts = useMemo(
    () =>
      personaAccounts.slice().sort((left, right) => {
        const leftRecency = personaRecencyById.get(left.entityId) ?? accountTimestamp(left);
        const rightRecency = personaRecencyById.get(right.entityId) ?? accountTimestamp(right);
        return rightRecency - leftRecency || sortAccountsByDisplayName(left, right);
      }),
    [personaAccounts, personaRecencyById],
  );
  const visiblePersonaAccounts = useMemo(
    () => sortedPersonaAccounts.slice(0, personaAccountLimit),
    [personaAccountLimit, sortedPersonaAccounts],
  );
  const posts = useMemo(() => data?.posts ?? [], [data?.posts]);
  const interactions = useMemo(() => data?.interactions ?? [], [data?.interactions]);
  const interactionsByPostId = useMemo(() => {
    const grouped = new Map<string, NoodleInteraction[]>();
    for (const interaction of interactions) {
      const postInteractions = grouped.get(interaction.postId) ?? [];
      postInteractions.push(interaction);
      grouped.set(interaction.postId, postInteractions);
    }
    return grouped;
  }, [interactions]);
  const scheduler = data?.scheduler;
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const accountByHandle = useMemo(
    () => new Map(accounts.map((account) => [account.handle.toLowerCase(), account])),
    [accounts],
  );
  const postById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const interactionById = useMemo(
    () => new Map(interactions.map((interaction) => [interaction.id, interaction])),
    [interactions],
  );
  const characterAccountByEntity = useMemo(
    () =>
      new Map(accounts.filter((account) => account.kind === "character").map((account) => [account.entityId, account])),
    [accounts],
  );
  const directlyInvitedCharacterIds = useMemo(
    () =>
      (data?.accounts ?? [])
        .filter((account) => account.kind === "character" && account.invited)
        .map((account) => account.entityId),
    [data?.accounts],
  );
  const personaAccount = useMemo(
    () => personaAccounts.find((account) => account.entityId === selectedPersonaId) ?? sortedPersonaAccounts[0] ?? null,
    [personaAccounts, selectedPersonaId, sortedPersonaAccounts],
  );
  const viewedProfileAccount = useMemo(
    () => (viewedProfileAccountId ? (accountById.get(viewedProfileAccountId) ?? null) : personaAccount),
    [accountById, personaAccount, viewedProfileAccountId],
  );
  const noodleCustomEmojiMap = useNoodleCustomEmojiMap(viewedProfileAccount);
  const viewingOwnProfile = Boolean(personaAccount && viewedProfileAccount?.id === personaAccount.id);
  const linkedPublicAccountIds = useMemo(
    () => new Set((noodlerAccountsQuery.data ?? []).flatMap((profile) => profile.publicAccountId ?? [])),
    [noodlerAccountsQuery.data],
  );
  const canCreateStageProfileFromViewed = Boolean(
    settings?.enableNoodler &&
      viewedProfileAccount &&
      (viewedProfileAccount.kind === "persona" || viewedProfileAccount.kind === "character") &&
      noodlerAccountsQuery.isSuccess &&
      !linkedPublicAccountIds.has(viewedProfileAccount.id),
  );
  const canEditViewedProfile = Boolean(
    viewingOwnProfile || (viewedProfileAccount?.kind === "character" && viewedProfileAccount.invited),
  );

  useEffect(() => {
    if (activeNoodleView !== "notifications" || !personaAccount) {
      notificationReadEntryRef.current = null;
      return;
    }

    const accountId = personaAccount.id;
    if (notificationReadEntryRef.current === accountId) return;
    notificationReadEntryRef.current = accountId;

    const previousOverride = notificationReadOverrides[accountId];
    const readAt = new Date().toISOString();
    setNotificationReadOverrides((current) => ({ ...current, [accountId]: readAt }));
    void patchAccountSettings
      .mutateAsync({
        id: accountId,
        subtree: "social",
        patch: { notificationsReadAt: readAt },
      })
      .then(() => {
        setNotificationReadOverrides((current) => {
          if (current[accountId] !== readAt) return current;
          const next = { ...current };
          delete next[accountId];
          return next;
        });
      })
      .catch((error: unknown) => {
        setNotificationReadOverrides((current) => {
          if (current[accountId] !== readAt) return current;
          const next = { ...current };
          if (previousOverride) next[accountId] = previousOverride;
          else delete next[accountId];
          return next;
        });
        toast.error(error instanceof Error ? error.message : "Could not mark Noodle notifications as read.");
      });
  }, [activeNoodleView, notificationReadOverrides, patchAccountSettings, personaAccount]);

  useEffect(() => {
    if (navigation.mode !== "public" || navigation.view !== "profile" || !viewedProfileAccountId) return;
    if (isLoading || !data || isError || accountById.has(viewedProfileAccountId)) return;
    onNavigate({ mode: "public", view: "home" });
  }, [accountById, data, isError, isLoading, navigation, onNavigate, viewedProfileAccountId]);

  useEffect(() => {
    // Do not erase the persisted choice while the account/persona queries are
    // still empty during initial hydration.
    if (!data || personas === null) return;
    if (selectedPersonaId && personaAccounts.some((account) => account.entityId === selectedPersonaId)) return;
    const activeId = readString(activePersona?.id);
    const activeAccount = personaAccounts.find((account) => account.entityId === activeId);
    const nextPersonaId = activeAccount?.entityId ?? sortedPersonaAccounts[0]?.entityId ?? "";
    if (selectedPersonaId !== nextPersonaId) setSelectedPersonaId(nextPersonaId);
  }, [activePersona, data, personaAccounts, personas, selectedPersonaId, setSelectedPersonaId, sortedPersonaAccounts]);

  useEffect(() => {
    if (accountSwitcherOpen) setPersonaAccountLimit(NOODLE_PERSONA_SWITCHER_PAGE_SIZE);
  }, [accountSwitcherOpen]);

  useEffect(() => {
    if (!mobileDrawerOpen) {
      setMobileAccountSwitcherOpen(false);
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileDrawerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileDrawerOpen]);

  useEffect(() => {
    setImageGenerationPromptDraft(settings?.imageGenerationPrompt ?? "");
  }, [settings?.imageGenerationPrompt]);

  useEffect(() => {
    if (!noodlePromptEditorOpen) setNoodlePromptDraft(noodlePromptText);
  }, [noodlePromptEditorOpen, noodlePromptText]);

  useEffect(() => {
    const accountId = viewedProfileAccount?.id ?? null;
    const identityChanged = profileDraftAccountIdRef.current !== accountId;
    profileDraftAccountIdRef.current = accountId;
    if (!viewedProfileAccount) return;

    if (identityChanged || !profileEditing) {
      setProfileHandle(viewedProfileAccount.handle);
      setProfileName(viewedProfileAccount.displayName);
      setProfileBio(viewedProfileAccount.bio);
      setProfileLocation(readAccountSetting(viewedProfileAccount, "location"));
      setProfileEditing(false);
    }
    setProfileAvatarUrl(viewedProfileAccount.avatarUrl ?? "");
    setProfileBannerUrl(readAccountSetting(viewedProfileAccount, "bannerUrl"));
  }, [profileEditing, viewedProfileAccount]);

  useEffect(() => {
    setInviteCharacterLimit(NOODLE_INVITE_PAGE_SIZE);
  }, [inviteSearch]);

  useEffect(() => {
    if (!editingRefreshTime || scheduler?.scheduledTimes.includes(editingRefreshTime)) return;
    setEditingRefreshTime(null);
    setRefreshTimeDraft("");
  }, [editingRefreshTime, scheduler?.scheduledTimes]);

  const saveSettings = (patch: NoodleSettingsUpdateInput) => {
    updateSettings.mutate(patch, {
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update Noodle settings."),
    });
  };

  const openNoodlePromptEditor = () => {
    if (!noodlePromptText) {
      toast.error("The default Noodle prompt is still loading.");
      return;
    }
    setNoodlePromptDraft(noodlePromptText);
    setNoodlePromptEditorOpen(true);
  };

  const closeNoodlePromptEditor = () => {
    setNoodlePromptDraft(noodlePromptText);
    setNoodlePromptEditorOpen(false);
  };

  const saveNoodlePromptDraft = async () => {
    if (!noodlePromptDraft.trim()) {
      toast.error("The Noodle prompt cannot be empty.");
      return;
    }
    try {
      await saveNoodlePrompt.mutateAsync({
        key: NOODLE_TIMELINE_BASE_PROMPT_KEY,
        template: noodlePromptDraft,
        enabled: true,
      });
      setNoodlePromptEditorOpen(false);
      toast.success("Noodle prompt saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the Noodle prompt.");
    }
  };

  const restoreDefaultNoodlePrompt = async () => {
    if (!noodlePromptHasOverride) {
      setNoodlePromptDraft(noodleDefaultPromptText);
      return;
    }
    try {
      await resetNoodlePrompt.mutateAsync(NOODLE_TIMELINE_BASE_PROMPT_KEY);
      setNoodlePromptDraft(noodleDefaultPromptText);
      toast.success("Default Noodle prompt restored.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore the default Noodle prompt.");
    }
  };

  const beginRefreshTimeEdit = (scheduledTime: string) => {
    setEditingRefreshTime(scheduledTime);
    setRefreshTimeDraft(formatNoodleRefreshTimeInput(scheduledTime, scheduler?.timezone));
  };

  const cancelRefreshTimeEdit = () => {
    setEditingRefreshTime(null);
    setRefreshTimeDraft("");
  };

  const saveRefreshTimeEdit = () => {
    if (!editingRefreshTime || !refreshTimeDraft) return;
    rescheduleRefresh.mutate(
      { scheduledTime: editingRefreshTime, time: refreshTimeDraft },
      {
        onSuccess: () => {
          cancelRefreshTimeEdit();
          toast.success("Automatic refresh rescheduled.");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reschedule refresh."),
      },
    );
  };

  const saveProfile = () => {
    if (!viewedProfileAccount || !canEditViewedProfile) return;
    const normalizedHandle = profileHandle.trim().replace(/^@+/, "");
    const nextAvatarUrl = profileAvatarUrl.trim() || null;
    updateAccountProfile.mutate(
      {
        id: viewedProfileAccount.id,
        handle: normalizedHandle,
        displayName: profileName.trim(),
        bio: profileBio,
        ...(nextAvatarUrl !== viewedProfileAccount.avatarUrl ? { avatarUrl: nextAvatarUrl } : {}),
        profile: { bannerUrl: profileBannerUrl.trim(), location: profileLocation.trim() },
      },
      {
        onSuccess: () => {
          setProfileEditing(false);
          toast.success("Noodle profile updated.");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update Noodle profile."),
      },
    );
  };

  const handleProfileImageFile = (target: "avatar" | "banner", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setProfileUploadTarget(target);
    uploadGlobalImages.mutate(
      { files: [file] },
      {
        onSuccess: (images) => {
          const image = images[0];
          if (!image?.url) {
            toast.error("Image uploaded, but no URL was returned.");
            return;
          }
          if (target === "avatar") setProfileAvatarUrl(image.url);
          else setProfileBannerUrl(image.url);

          if (!viewedProfileAccount || !canEditViewedProfile) return;
          const callbacks = {
            onSuccess: () => toast.success(target === "avatar" ? "Noodle avatar updated." : "Noodle banner updated."),
            onError: (error: Error) => toast.error(error.message || "Could not update Noodle profile image."),
          };
          if (target === "avatar") {
            updateAccountProfile.mutate(
              { id: viewedProfileAccount.id, avatarUrl: image.url, profile: {} },
              callbacks,
            );
          } else {
            updateAccountProfile.mutate(
              { id: viewedProfileAccount.id, profile: { bannerUrl: image.url } },
              callbacks,
            );
          }
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not upload profile image."),
        onSettled: () => setProfileUploadTarget(null),
      },
    );
  };

  const appendToComposer = (text: string) => {
    const textarea = composeOpen ? modalComposerRef.current : inlineComposerRef.current;
    const source = textarea?.value ?? composerValueRef.current;
    const inserted = insertAtSelection(
      source,
      text,
      textarea?.selectionStart ?? source.length,
      textarea?.selectionEnd ?? textarea?.selectionStart ?? source.length,
    );
    composerValueRef.current = inserted.value;
    const hasText = Boolean(inserted.value.trim());
    composerHasTextRef.current = hasText;
    setComposerHasText(hasText);
    setComposer(inserted.value);
    if (textarea) textarea.value = inserted.value;
    setActiveMention(null);
    setActiveMentionIndex(0);
    window.requestAnimationFrame(() => {
      const activeTextarea = composeOpen ? modalComposerRef.current : inlineComposerRef.current;
      activeTextarea?.focus();
      activeTextarea?.setSelectionRange(inserted.caret, inserted.caret);
    });
  };

  const applyImageUrl = () => {
    const url = imageUrlDraft.trim();
    if (!url) {
      toast.error("Paste an image URL first.");
      return;
    }
    setAttachedImageUrl(url);
    setImageUrlDraft("");
    setActiveComposerTool(null);
  };

  const handleImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadGlobalImages.mutate(
      { files: [file] },
      {
        onSuccess: (images) => {
          const image = images[0];
          if (!image?.url) {
            toast.error("Image uploaded, but no URL was returned.");
            return;
          }
          setAttachedImageUrl(image.url);
          setActiveComposerTool(null);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not attach image."),
      },
    );
  };

  const appendToReply = (text: string) => {
    const textarea = replyComposerRef.current;
    const source = textarea?.value ?? replyValueRef.current;
    const inserted = insertAtSelection(
      source,
      text,
      textarea?.selectionStart ?? source.length,
      textarea?.selectionEnd ?? textarea?.selectionStart ?? source.length,
    );
    replyValueRef.current = inserted.value;
    const hasText = Boolean(inserted.value.trim());
    replyHasTextRef.current = hasText;
    setReplyHasText(hasText);
    setReplyText(inserted.value);
    if (textarea) textarea.value = inserted.value;
    setActiveReplyMention(null);
    setActiveReplyMentionIndex(0);
    window.requestAnimationFrame(() => {
      replyComposerRef.current?.focus();
      replyComposerRef.current?.setSelectionRange(inserted.caret, inserted.caret);
    });
  };

  const applyReplyImageUrl = () => {
    const url = replyImageUrlDraft.trim();
    if (!url) {
      toast.error("Paste an image URL first.");
      return;
    }
    setReplyImageUrl(url);
    setReplyImageUrlDraft("");
    setActiveReplyComposerTool(null);
  };

  const handleReplyImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadGlobalImages.mutate(
      { files: [file] },
      {
        onSuccess: (images) => {
          const image = images[0];
          if (!image?.url) {
            toast.error("Image uploaded, but no URL was returned.");
            return;
          }
          setReplyImageUrl(image.url);
          setActiveReplyComposerTool(null);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not attach image."),
      },
    );
  };

  const clearReplyComposer = () => {
    setReplyPostId(null);
    setReplyParentInteractionId(null);
    setReplyText("");
    replyValueRef.current = "";
    replyHasTextRef.current = false;
    setReplyHasText(false);
    if (replyComposerRef.current) replyComposerRef.current.value = "";
    setActiveReplyMention(null);
    setActiveReplyMentionIndex(0);
    setReplyImageUrl("");
    setReplyImageUrlDraft("");
    setActiveReplyComposerTool(null);
  };

  const switchPersona = (account: NoodleAccount, mobile: boolean) => {
    composerValueRef.current = "";
    composerHasTextRef.current = false;
    setComposer("");
    if (inlineComposerRef.current) inlineComposerRef.current.value = "";
    if (modalComposerRef.current) modalComposerRef.current.value = "";
    setComposerHasText(false);
    setActiveMention(null);
    setActiveMentionIndex(0);
    setAttachedImageUrl("");
    setImageUrlDraft("");
    setDraftPoll(null);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setActiveComposerTool(null);
    setComposeOpen(false);
    clearReplyComposer();
    setSelectedPersonaId(account.entityId);
    setProfileEditing(false);
    setProfileTab("posts");
    onNavigate({ mode: "public", view: "home" });
    setAccountSwitcherOpen(false);
    if (mobile) {
      setMobileAccountSwitcherOpen(false);
      setMobileDrawerOpen(false);
    }
  };

  const openReplyComposer = (postId: string, parentInteractionId: string | null = null) => {
    if (replyPostId === postId && replyParentInteractionId === parentInteractionId) {
      clearReplyComposer();
      return;
    }
    setReplyPostId(postId);
    setReplyParentInteractionId(parentInteractionId);
    setReplyText("");
    replyValueRef.current = "";
    replyHasTextRef.current = false;
    setReplyHasText(false);
    setActiveReplyMention(null);
    setActiveReplyMentionIndex(0);
    setReplyImageUrl("");
    setReplyImageUrlDraft("");
    setActiveReplyComposerTool(null);
    setActiveComposerTool(null);
  };

  const applyPoll = () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      toast.error("Polls need a question and at least two options.");
      return;
    }
    if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
      toast.error("Poll options need to be different from each other.");
      return;
    }
    setDraftPoll({ question, options });
    setPollQuestion("");
    setPollOptions(["", ""]);
    setActiveComposerTool(null);
  };

  const togglePollComposer = () => {
    if (activeComposerTool === "poll") {
      setActiveComposerTool(null);
      return;
    }
    setPollQuestion(draftPoll?.question ?? "");
    setPollOptions(draftPoll?.options ?? ["", ""]);
    setActiveComposerTool("poll");
  };

  const renderDraftPoll = () =>
    draftPoll ? (
      <section
        className="mb-3 rounded-xl border border-[var(--noodle-blue)]/35 bg-[var(--noodle-blue)]/5 p-3"
        aria-label={`Draft poll: ${draftPoll.question}`}
        data-component="NoodleView.DraftPoll"
      >
        <div className="flex items-start gap-2">
          <ListChecks size={16} className="mt-0.5 shrink-0 text-[var(--noodle-blue)]" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold leading-5">{draftPoll.question}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted-foreground)]">
              {draftPoll.options.map((option) => (
                <li key={option} className="truncate">
                  {option}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={togglePollComposer}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
            title="Edit poll"
            aria-label="Edit draft poll"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => setDraftPoll(null)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
            title="Remove poll"
            aria-label="Remove draft poll"
          >
            <X size={14} />
          </button>
        </div>
      </section>
    ) : null;

  const canSubmitPost = Boolean(personaAccount && (composerHasText || attachedImageUrl.trim() || draftPoll));
  const confirmActionPending =
    confirmAction?.kind === "delete-post"
      ? deletePost.isPending
      : confirmAction?.kind === "delete-reply"
        ? deleteInteraction.isPending
        : confirmAction?.kind === "reset-timeline"
          ? resetNoodleTimeline.isPending
          : confirmAction?.kind === "uninvite-everybody"
            ? clearInvites.isPending
          : false;
  const normalizedProfileHandle = profileHandle.trim().replace(/^@+/, "");
  const isEditingProfile = canEditViewedProfile && profileEditing;
  const profileDisplayName = canEditViewedProfile
    ? profileName.trim() || viewedProfileAccount?.displayName || "Noodle Account"
    : viewedProfileAccount?.displayName || "Noodle Account";
  const profileDisplayHandle = canEditViewedProfile
    ? normalizedProfileHandle
    : (viewedProfileAccount?.handle ?? "noodle");
  const profileBioPreview = canEditViewedProfile ? profileBio.trim() : (viewedProfileAccount?.bio.trim() ?? "");
  const profileAvatarPreview = canEditViewedProfile
    ? profileAvatarUrl.trim() || null
    : (viewedProfileAccount?.avatarUrl ?? null);
  const profileAvatarCropPreview =
    viewedProfileAccount && profileAvatarPreview === viewedProfileAccount.avatarUrl
      ? viewedProfileAccount.avatarCrop
      : null;
  const profilePreviewAccount = {
    displayName: profileDisplayName,
    avatarUrl: profileAvatarPreview,
    avatarCrop: profileAvatarCropPreview,
  };
  const profileBannerPreview = canEditViewedProfile
    ? profileBannerUrl.trim()
    : readAccountSetting(viewedProfileAccount, "bannerUrl");
  const profileLocationPreview = canEditViewedProfile
    ? profileLocation.trim()
    : readAccountSetting(viewedProfileAccount, "location");
  const canSaveProfile = Boolean(canEditViewedProfile && profileName.trim() && normalizedProfileHandle);
  const rawPostSearch = postSearch.trim();
  const normalizedPostSearch = rawPostSearch.toLowerCase();
  const isAccountSearch = rawPostSearch.includes("@");
  const accountSearchTerm = extractAccountSearchTerm(rawPostSearch);
  const selectedCharacterGroupIds = useMemo(
    () => new Set(settings?.invitedCharacterGroupIds ?? []),
    [settings?.invitedCharacterGroupIds],
  );
  const folderInvitedCharacterIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of characterGroups) {
      const groupId = readString(group.id);
      if (!groupId || !selectedCharacterGroupIds.has(groupId)) continue;
      for (const characterId of readStringArray(group.characterIds)) ids.add(characterId);
    }
    return ids;
  }, [characterGroups, selectedCharacterGroupIds]);
  const mentionableCharacterAccounts = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            account.kind === "character" && (account.invited || folderInvitedCharacterIds.has(account.entityId)),
        )
        .sort(sortAccountsByDisplayName),
    [accounts, folderInvitedCharacterIds],
  );
  const mentionSuggestions = useMemo(() => {
    return matchingMentionAccounts(mentionableCharacterAccounts, activeMention);
  }, [activeMention, mentionableCharacterAccounts]);
  const replyMentionSuggestions = useMemo(
    () => matchingMentionAccounts(mentionableCharacterAccounts, activeReplyMention),
    [activeReplyMention, mentionableCharacterAccounts],
  );
  const selectedFolderCharacterIds = useMemo(() => Array.from(folderInvitedCharacterIds), [folderInvitedCharacterIds]);
  const uninvitedSelectedFolderCharacterIds = useMemo(
    () => selectedFolderCharacterIds.filter((id) => characterAccountByEntity.get(id)?.invited !== true),
    [characterAccountByEntity, selectedFolderCharacterIds],
  );
  const folderInviteButtonLabel =
    selectedCharacterGroupIds.size === 0
      ? "Select folders to invite"
      : uninvitedSelectedFolderCharacterIds.length === 0
        ? "Selected folder characters are invited"
        : `Invite ${uninvitedSelectedFolderCharacterIds.length} ${
            uninvitedSelectedFolderCharacterIds.length === 1 ? "character" : "characters"
          }`;
  const hasActiveInvites = Boolean(
    directlyInvitedCharacterIds.length > 0 || selectedCharacterGroupIds.size > 0 || settings?.allowRandomUsers,
  );
  const followedAccountIds = useMemo(
    () => new Set(personaAccount?.settings.social.followingAccountIds ?? []),
    [personaAccount?.settings],
  );
  const canFollowViewedProfile = Boolean(
    viewedProfileAccount &&
    viewedProfileAccount.kind === "character" &&
    hasGeneratedProfile(viewedProfileAccount) &&
    (viewedProfileAccount.invited || folderInvitedCharacterIds.has(viewedProfileAccount.entityId)),
  );
  const canFollowAccount = useCallback(
    (account: NoodleAccount | null) =>
      Boolean(
        account &&
        account.kind === "character" &&
        hasGeneratedProfile(account) &&
        (account.invited || folderInvitedCharacterIds.has(account.entityId)),
      ),
    [folderInvitedCharacterIds],
  );
  const viewedProfileFollowed = Boolean(viewedProfileAccount && followedAccountIds.has(viewedProfileAccount.id));
  const followedCharacterAccountIds = useMemo(
    () =>
      new Set(
        accounts
          .filter(
            (account) =>
              account.kind === "character" &&
              followedAccountIds.has(account.id) &&
              (account.invited || folderInvitedCharacterIds.has(account.entityId)),
          )
          .map((account) => account.id),
      ),
    [accounts, folderInvitedCharacterIds, followedAccountIds],
  );
  const latestExternalReplyToPersonaCommentAtByPostId = useMemo(() => {
    const latest = new Map<string, number>();
    if (!personaAccount) return latest;
    for (const interaction of interactions) {
      if (
        interaction.type !== "reply" ||
        interaction.actorAccountId === personaAccount.id ||
        !interaction.parentInteractionId
      ) {
        continue;
      }
      const parentComment = interactionById.get(interaction.parentInteractionId);
      if (parentComment?.type !== "reply" || parentComment.actorAccountId !== personaAccount.id) continue;
      const createdAt = new Date(interaction.createdAt).getTime();
      if (!Number.isFinite(createdAt)) continue;
      latest.set(interaction.postId, Math.max(latest.get(interaction.postId) ?? 0, createdAt));
    }
    return latest;
  }, [interactionById, interactions, personaAccount]);
  const baseTimelinePosts = useMemo(() => {
    const visiblePosts =
      timelineTab === "following"
        ? posts.filter((post) => followedCharacterAccountIds.has(post.authorAccountId))
        : posts;
    return visiblePosts.slice().sort((left, right) => {
      const leftActivityAt = Math.max(
        new Date(left.createdAt).getTime() || 0,
        latestExternalReplyToPersonaCommentAtByPostId.get(left.id) ?? 0,
      );
      const rightActivityAt = Math.max(
        new Date(right.createdAt).getTime() || 0,
        latestExternalReplyToPersonaCommentAtByPostId.get(right.id) ?? 0,
      );
      return rightActivityAt - leftActivityAt;
    });
  }, [followedCharacterAccountIds, latestExternalReplyToPersonaCommentAtByPostId, posts, timelineTab]);
  const timelinePosts = useMemo(() => {
    if (!normalizedPostSearch || isAccountSearch) return baseTimelinePosts;
    return baseTimelinePosts.filter((post) => {
      const author = accountById.get(post.authorAccountId) ?? post.authorSnapshot;
      return [post.content, post.imagePrompt, author?.displayName, author?.handle].some((value) =>
        readString(value).toLowerCase().includes(normalizedPostSearch),
      );
    });
  }, [accountById, baseTimelinePosts, isAccountSearch, normalizedPostSearch]);
  const accountSearchResults = useMemo(() => {
    if (!isAccountSearch) return [];
    const exactHandle = accountSearchTerm;
    return accounts
      .filter((account) => accountMatchesSearch(account, exactHandle))
      .sort((left, right) => {
        const leftExact = left.handle.toLowerCase() === exactHandle;
        const rightExact = right.handle.toLowerCase() === exactHandle;
        if (leftExact !== rightExact) return leftExact ? -1 : 1;
        const leftStarts = left.handle.toLowerCase().startsWith(exactHandle);
        const rightStarts = right.handle.toLowerCase().startsWith(exactHandle);
        if (leftStarts !== rightStarts) return leftStarts ? -1 : 1;
        return sortAccountsByDisplayName(left, right);
      })
      .slice(0, 50);
  }, [accountSearchTerm, accounts, isAccountSearch]);
  const profilePosts = useMemo(
    () => (viewedProfileAccount ? posts.filter((post) => post.authorAccountId === viewedProfileAccount.id) : []),
    [posts, viewedProfileAccount],
  );
  const profileLikedPosts = useMemo(() => {
    if (!viewedProfileAccount) return [];
    const likedAtByPostId = new Map<string, string>();
    for (const interaction of interactions) {
      if (
        interaction.actorAccountId === viewedProfileAccount.id &&
        interaction.type === "like" &&
        !interaction.parentInteractionId
      ) {
        likedAtByPostId.set(interaction.postId, interaction.createdAt);
      }
    }
    return posts
      .filter((post) => likedAtByPostId.has(post.id))
      .sort((a, b) => {
        const aTime = new Date(likedAtByPostId.get(a.id) ?? a.createdAt).getTime();
        const bTime = new Date(likedAtByPostId.get(b.id) ?? b.createdAt).getTime();
        return bTime - aTime;
      });
  }, [interactions, posts, viewedProfileAccount]);
  const profileMediaPosts = useMemo(() => profilePosts.filter((post) => Boolean(post.imageUrl)), [profilePosts]);
  const profileVisiblePosts =
    profileTab === "likes" ? profileLikedPosts : profileTab === "media" ? profileMediaPosts : profilePosts;
  const profileFollowerAccounts = useMemo(() => {
    if (!viewedProfileAccount) return [];
    const explicitFollowers = accounts.filter((account) => {
      if (account.id === viewedProfileAccount.id) return false;
      const followingAccountIds = account.settings.social.followingAccountIds ?? [];
      return followingAccountIds.includes(viewedProfileAccount.id);
    });
    const personaFollowsViewedProfile =
      !viewingOwnProfile &&
      personaAccount &&
      viewedProfileAccount.kind === "character" &&
      followedAccountIds.has(viewedProfileAccount.id)
        ? [personaAccount]
        : [];
    return uniqueAccountsById([...explicitFollowers, ...personaFollowsViewedProfile]).sort(sortAccountsByDisplayName);
  }, [accounts, followedAccountIds, personaAccount, viewedProfileAccount, viewingOwnProfile]);
  const profileFollowingAccounts = useMemo(() => {
    if (viewingOwnProfile) {
      const explicitFollowing = (personaAccount?.settings.social.followingAccountIds ?? []).map((id) =>
        accountById.get(id),
      );
      return uniqueAccountsById(explicitFollowing).sort(sortAccountsByDisplayName);
    }
    if (!viewedProfileAccount) return [];
    const followingIds = new Set(viewedProfileAccount.settings.social.followingAccountIds ?? []);
    return uniqueAccountsById([...followingIds].map((id) => accountById.get(id))).sort(sortAccountsByDisplayName);
  }, [accountById, personaAccount, viewedProfileAccount, viewingOwnProfile]);
  const profileFollowerCount = profileFollowerAccounts.length;
  const profileFollowingCount = profileFollowingAccounts.length;
  const profileConnectionAccounts =
    profileConnectionTab === "following" ? profileFollowingAccounts : profileFollowerAccounts;
  const notificationLikes = useMemo(() => {
    if (!personaAccount) return [];
    const personaPostIds = new Set(
      posts.filter((post) => post.authorAccountId === personaAccount.id).map((post) => post.id),
    );
    return interactions
      .filter((interaction) => interaction.type === "like" && interaction.actorAccountId !== personaAccount.id)
      .map((interaction) => {
        const targetReply = interaction.parentInteractionId
          ? (interactionById.get(interaction.parentInteractionId) ?? null)
          : null;
        const targetsPersona = targetReply
          ? targetReply.actorAccountId === personaAccount.id
          : personaPostIds.has(interaction.postId);
        return {
          interaction,
          targetReply,
          targetsPersona,
          post: postById.get(interaction.postId) ?? null,
          actorAccount: accountById.get(interaction.actorAccountId) ?? null,
          actorSnapshot: interaction.actorSnapshot,
        };
      })
      .filter((item) => item.targetsPersona)
      .filter((item): item is typeof item & { post: NoodlePost } => Boolean(item.post))
      .sort(
        (left, right) =>
          new Date(right.interaction.createdAt).getTime() - new Date(left.interaction.createdAt).getTime(),
      );
  }, [accountById, interactionById, interactions, personaAccount, postById, posts]);
  const notificationFollowAccounts = useMemo(() => {
    if (!personaAccount) return [];
    return accounts
      .flatMap((account) => {
        if (account.id === personaAccount.id) return [];
        const followingAccountIds = account.settings.social.followingAccountIds ?? [];
        if (!followingAccountIds.includes(personaAccount.id)) return [];
        const followedAtByAccount = account.settings.social.followingAccountTimestamps ?? {};
        return [{ account, followedAt: followedAtByAccount[personaAccount.id] }];
      })
      .sort((left, right) => (Date.parse(right.followedAt) || 0) - (Date.parse(left.followedAt) || 0));
  }, [accounts, personaAccount]);
  const notificationReplyItems = useMemo(() => {
    if (!personaAccount) return [];
    const items: Array<{
      id: string;
      kind: "reply" | "mention";
      createdAt: string;
      actorAccount: NoodleAccount | null;
      actorSnapshot: NoodlePost["authorSnapshot"];
      post: NoodlePost;
      content: string;
      replyTarget: "post" | "comment" | null;
      interactionId: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const interaction of interactions) {
      if (interaction.type !== "reply" || interaction.actorAccountId === personaAccount.id) continue;
      const post = postById.get(interaction.postId);
      if (!post) continue;
      const parentReply = interaction.parentInteractionId
        ? (interactionById.get(interaction.parentInteractionId) ?? null)
        : null;
      const repliesToPersonaComment = parentReply?.actorAccountId === personaAccount.id;
      const repliesToPersona = repliesToPersonaComment || post.authorAccountId === personaAccount.id;
      const mentionsPersona = textMentionsHandle(interaction.content, personaAccount.handle);
      if (!repliesToPersona && !mentionsPersona) continue;
      const id = `reply:${interaction.id}`;
      seen.add(id);
      items.push({
        id,
        kind: repliesToPersona ? "reply" : "mention",
        createdAt: interaction.createdAt,
        actorAccount: accountById.get(interaction.actorAccountId) ?? null,
        actorSnapshot: interaction.actorSnapshot,
        post,
        content: interaction.content ?? "",
        replyTarget: repliesToPersonaComment ? "comment" : repliesToPersona ? "post" : null,
        interactionId: interaction.id,
      });
    }
    for (const post of posts) {
      if (post.authorAccountId === personaAccount.id || !textMentionsHandle(post.content, personaAccount.handle)) {
        continue;
      }
      const id = `post:${post.id}`;
      if (seen.has(id)) continue;
      items.push({
        id,
        kind: "mention",
        createdAt: post.createdAt,
        actorAccount: accountById.get(post.authorAccountId) ?? null,
        actorSnapshot: post.authorSnapshot,
        post,
        content: post.content,
        replyTarget: null,
        interactionId: null,
      });
    }
    return items.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [accountById, interactionById, interactions, personaAccount, postById, posts]);

  useEffect(() => {
    if (activeNoodleView !== "home" || !notificationFocusTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const timeline = timelineScrollRef.current;
      if (!timeline) return;
      const postElement = Array.from(timeline.querySelectorAll<HTMLElement>("[data-noodle-post-id]")).find(
        (element) => element.dataset.noodlePostId === notificationFocusTarget.postId,
      );
      const interactionElement = notificationFocusTarget.interactionId
        ? Array.from(timeline.querySelectorAll<HTMLElement>("[data-noodle-interaction-id]")).find(
            (element) => element.dataset.noodleInteractionId === notificationFocusTarget.interactionId,
          )
        : null;
      const targetElement = interactionElement ?? postElement;
      if (!targetElement) {
        setNotificationFocusTarget(null);
        return;
      }
      targetElement.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      targetElement.focus({ preventScroll: true });
      setHighlightedInteractionId(interactionElement ? notificationFocusTarget.interactionId : null);
      setNotificationFocusTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeNoodleView, notificationFocusTarget, prefersReducedMotion]);

  useEffect(() => {
    if (!highlightedInteractionId) return;
    const timeout = window.setTimeout(() => setHighlightedInteractionId(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [highlightedInteractionId]);

  const notificationReadAt = personaAccount
    ? (notificationReadOverrides[personaAccount.id] ?? personaAccount.settings.social.notificationsReadAt ?? "")
    : "";
  const notificationReadTime = Date.parse(notificationReadAt) || 0;
  const notificationCount =
    notificationLikes.filter((item) => new Date(item.interaction.createdAt).getTime() > notificationReadTime).length +
    notificationFollowAccounts.filter((item) => (Date.parse(item.followedAt) || 0) > notificationReadTime).length +
    notificationReplyItems.filter((item) => new Date(item.createdAt).getTime() > notificationReadTime).length;
  const followableCharacterAccounts = useMemo(
    () =>
      accounts
        .filter(
          (account) =>
            account.kind === "character" &&
            hasGeneratedProfile(account) &&
            (account.invited || folderInvitedCharacterIds.has(account.entityId)),
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [accounts, folderInvitedCharacterIds],
  );
  const suggestedCharacters = useMemo(
    () =>
      followableCharacterAccounts
        .filter((account) => !followedAccountIds.has(account.id))
        .map((account) => ({
          account,
          accountId: account.id,
          name: account.displayName,
          handle: account.handle,
          avatarUrl: account.avatarUrl,
        }))
        .slice(0, 5),
    [followableCharacterAccounts, followedAccountIds],
  );

  const openProfile = (account: NoodleAccount | null) => {
    if (!account) return;
    setProfileEditing(false);
    setProfileTab("posts");
    onNavigate({
      mode: "public",
      view: "profile",
      accountId: account.id === personaAccount?.id ? null : account.id,
      connection: null,
    });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
  };

  const openOwnProfile = () => {
    setProfileEditing(false);
    setProfileTab("posts");
    onNavigate({ mode: "public", view: "profile", accountId: null, connection: null });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
  };

  const handleSearchChange = (value: string) => {
    setPostSearch(value);
    if (!value.trim()) return;
    onNavigate({ mode: "public", view: "home" });
    setAccountSwitcherOpen(false);
  };

  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    composerValueRef.current = value;
    const hasText = Boolean(value.trim());
    if (hasText !== composerHasTextRef.current) {
      composerHasTextRef.current = hasText;
      setComposerHasText(hasText);
    }
    const nextMention = activeComposerMention(value, event.target.selectionStart ?? value.length);
    if (nextMention || activeMention) setActiveMention(nextMention);
    if (activeMentionIndex !== 0) setActiveMentionIndex(0);
  };

  const selectComposerMention = (account: NoodleAccount) => {
    if (!activeMention) return;
    const insertedMention = `@${account.handle} `;
    const source = composerValueRef.current;
    const nextComposer = source.slice(0, activeMention.start) + insertedMention + source.slice(activeMention.end);
    const nextCaret = activeMention.start + insertedMention.length;
    composerValueRef.current = nextComposer;
    composerHasTextRef.current = Boolean(nextComposer.trim());
    setComposerHasText(composerHasTextRef.current);
    setComposer(nextComposer);
    setActiveMention(null);
    setActiveMentionIndex(0);
    window.requestAnimationFrame(() => {
      const textarea = composeOpen ? modalComposerRef.current : inlineComposerRef.current;
      if (textarea) textarea.value = nextComposer;
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeMention) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActiveMention(null);
      return;
    }
    if (mentionSuggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveMentionIndex((current) => (current + direction + mentionSuggestions.length) % mentionSuggestions.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const account = mentionSuggestions[Math.min(activeMentionIndex, mentionSuggestions.length - 1)];
      if (account) selectComposerMention(account);
    }
  };

  const renderComposerMentionSuggestions = (listboxId: string) => {
    return (
      <NoodleMentionSuggestions
        activeMention={activeMention}
        activeIndex={activeMentionIndex}
        accounts={mentionSuggestions}
        listboxId={listboxId}
        onSelect={selectComposerMention}
      />
    );
  };

  const handleReplyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    replyValueRef.current = value;
    const hasText = Boolean(value.trim());
    if (hasText !== replyHasTextRef.current) {
      replyHasTextRef.current = hasText;
      setReplyHasText(hasText);
    }
    const nextMention = activeComposerMention(value, event.target.selectionStart ?? value.length);
    if (nextMention || activeReplyMention) setActiveReplyMention(nextMention);
    if (activeReplyMentionIndex !== 0) setActiveReplyMentionIndex(0);
  };

  const selectReplyMention = (account: NoodleAccount) => {
    if (!activeReplyMention) return;
    const insertedMention = `@${account.handle} `;
    const source = replyValueRef.current;
    const nextReply = source.slice(0, activeReplyMention.start) + insertedMention + source.slice(activeReplyMention.end);
    const nextCaret = activeReplyMention.start + insertedMention.length;
    replyValueRef.current = nextReply;
    replyHasTextRef.current = Boolean(nextReply.trim());
    setReplyHasText(replyHasTextRef.current);
    setReplyText(nextReply);
    setActiveReplyMention(null);
    setActiveReplyMentionIndex(0);
    window.requestAnimationFrame(() => {
      if (replyComposerRef.current) replyComposerRef.current.value = nextReply;
      replyComposerRef.current?.focus();
      replyComposerRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleReplyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeReplyMention) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setActiveReplyMention(null);
      return;
    }
    if (replyMentionSuggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveReplyMentionIndex(
        (current) => (current + direction + replyMentionSuggestions.length) % replyMentionSuggestions.length,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const account = replyMentionSuggestions[Math.min(activeReplyMentionIndex, replyMentionSuggestions.length - 1)];
      if (account) selectReplyMention(account);
    }
  };

  const updateFollowedAccount = (account: NoodleAccount, followed: boolean) => {
    if (!personaAccount || account.id === personaAccount.id) return;
    updateAccountFollow.mutate(
      {
        id: personaAccount.id,
        targetAccountId: account.id,
        followed,
      },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update followed accounts."),
      },
    );
  };

  const submitPost = () => {
    if (!personaAccount || !canSubmitPost) return;
    const content = composerValueRef.current.trim() || draftPoll?.question || "Shared an image.";
    createPost.mutate(
      {
        authorKind: "persona",
        authorEntityId: personaAccount.entityId,
        content,
        imageUrl: attachedImageUrl.trim() || null,
        poll: draftPoll,
      },
      {
        onSuccess: () => {
          composerValueRef.current = "";
          composerHasTextRef.current = false;
          if (inlineComposerRef.current) inlineComposerRef.current.value = "";
          if (modalComposerRef.current) modalComposerRef.current.value = "";
          setComposer("");
          setComposerHasText(false);
          setActiveMention(null);
          setAttachedImageUrl("");
          setDraftPoll(null);
          setPollQuestion("");
          setPollOptions(["", ""]);
          setActiveComposerTool(null);
          setComposeOpen(false);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not post to Noodle."),
      },
    );
  };

  const reactToPost = (post: NoodlePostCardModel, type: "like" | "repost", active = false) => {
    if (!personaAccount) return;
    if (active) {
      removeInteraction.mutate(
        {
          postId: post.id,
          actorKind: "persona",
          actorEntityId: personaAccount.entityId,
          type,
        },
        {
          onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update Noodle post."),
        },
      );
      return;
    }
    createInteraction.mutate(
      {
        postId: post.id,
        actorKind: "persona",
        actorEntityId: personaAccount.entityId,
        type,
        content: null,
      },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update Noodle post."),
      },
    );
  };

  const voteInPoll = (post: NoodlePostCardModel, optionId: string, selectedOptionId: string | null) => {
    if (!personaAccount || optionId === selectedOptionId) return;
    createInteraction.mutate(
      {
        postId: post.id,
        actorKind: "persona",
        actorEntityId: personaAccount.entityId,
        type: "vote",
        content: optionId,
      },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save your poll vote."),
      },
    );
  };

  const submitReply = (post: NoodlePostCardModel) => {
    const replyContent = replyValueRef.current.trim();
    if (!personaAccount || (!replyContent && !replyImageUrl.trim())) return;
    createInteraction.mutate(
      {
        postId: post.id,
        actorKind: "persona",
        actorEntityId: personaAccount.entityId,
        type: "reply",
        content: replyContent || null,
        imageUrl: replyImageUrl.trim() || null,
        parentInteractionId: replyParentInteractionId,
      },
      {
        onSuccess: clearReplyComposer,
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reply on Noodle."),
      },
    );
  };

  const createInteractionPendingFor = (
    postId: string,
    type: NoodleInteractionType,
    parentInteractionId: string | null = null,
  ) =>
    createInteraction.isPending &&
    createInteraction.variables?.postId === postId &&
    createInteraction.variables.type === type &&
    (createInteraction.variables.parentInteractionId ?? null) === parentInteractionId;

  const removeInteractionPendingFor = (
    postId: string,
    type: "like" | "repost",
    parentInteractionId: string | null = null,
  ) =>
    removeInteraction.isPending &&
    removeInteraction.variables?.postId === postId &&
    removeInteraction.variables.type === type &&
    (removeInteraction.variables.parentInteractionId ?? null) === parentInteractionId;

  const reactionPendingFor = (postId: string, type: "like" | "repost", parentInteractionId: string | null = null) =>
    createInteractionPendingFor(postId, type, parentInteractionId) ||
    removeInteractionPendingFor(postId, type, parentInteractionId);

  const reactToReply = (post: NoodlePostCardModel, target: NoodleInteraction, active: boolean) => {
    if (!personaAccount) return;
    const input = {
      postId: post.id,
      actorKind: "persona" as const,
      actorEntityId: personaAccount.entityId,
      type: "like" as const,
      parentInteractionId: target.id,
    };
    if (active) {
      removeInteraction.mutate(input, {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update comment like."),
      });
      return;
    }
    createInteraction.mutate(
      { ...input, content: null },
      {
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update comment like."),
      },
    );
  };

  const startEditingPost = (post: NoodlePostCardModel) => {
    setEditingPostId(post.id);
    setEditingPostContent(post.content);
    setPostMenuId(null);
  };

  const cancelEditingPost = () => {
    setEditingPostId(null);
    setEditingPostContent("");
  };

  const saveEditedPost = (post: NoodlePostCardModel) => {
    const content = editingPostContent.trim();
    if (!content) {
      toast.error("Posts cannot be empty.");
      return;
    }
    updatePost.mutate(
      { id: post.id, content },
      {
        onSuccess: () => cancelEditingPost(),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not edit Noodle post."),
      },
    );
  };

  const startEditingReply = (reply: NoodleInteraction) => {
    setEditingReplyId(reply.id);
    setEditingReplyContent(reply.content ?? "");
  };

  const cancelEditingReply = () => {
    setEditingReplyId(null);
    setEditingReplyContent("");
  };

  const saveEditedReply = (post: NoodlePostCardModel, reply: NoodleInteraction) => {
    if (!personaAccount) return;
    const content = editingReplyContent.trim();
    if (!content && !reply.imageUrl) {
      toast.error("Comments need text or an image.");
      return;
    }
    updateInteraction.mutate(
      {
        postId: post.id,
        interactionId: reply.id,
        personaId: personaAccount.entityId,
        content,
      },
      {
        onSuccess: cancelEditingReply,
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not edit Noodle comment."),
      },
    );
  };

  const deleteNoodleReply = (post: NoodlePostCardModel, reply: NoodleInteraction) => {
    setConfirmAction({
      kind: "delete-reply",
      postId: post.id,
      interactionId: reply.id,
      title: "Delete Noodle Comment",
      message: "This removes the comment and any replies or likes attached to it.",
      confirmLabel: "Delete comment",
    });
  };

  const deleteNoodlePost = (post: NoodlePostCardModel) => {
    setPostMenuId(null);
    setConfirmAction({
      kind: "delete-post",
      postId: post.id,
      title: "Delete Noodle Post",
      message: "This removes the post and its likes, reposts, replies, and activity note.",
      confirmLabel: "Delete post",
    });
  };

  const resetTimeline = () => {
    setConfirmAction({
      kind: "reset-timeline",
      title: "Reset Noodle Timeline",
      message:
        "This removes all posts, replies, likes, reposts, activity digests, and refresh records. Profiles, follows, invites, and settings stay.",
      confirmLabel: "Reset timeline",
    });
  };

  const confirmNoodleAction = () => {
    if (!confirmAction) return;
    if (confirmAction.kind === "delete-post") {
      const postId = confirmAction.postId;
      deletePost.mutate(postId, {
        onSuccess: () => {
          if (replyPostId === postId) {
            clearReplyComposer();
          }
          if (editingPostId === postId) cancelEditingPost();
          setConfirmAction(null);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete Noodle post."),
      });
      return;
    }
    if (confirmAction.kind === "delete-reply") {
      if (!personaAccount) return;
      const { postId, interactionId } = confirmAction;
      deleteInteraction.mutate(
        { postId, interactionId, personaId: personaAccount.entityId },
        {
          onSuccess: () => {
            if (editingReplyId === interactionId) cancelEditingReply();
            if (replyParentInteractionId === interactionId) clearReplyComposer();
            setConfirmAction(null);
          },
          onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete Noodle comment."),
        },
      );
      return;
    }
    if (confirmAction.kind === "uninvite-everybody") {
      clearInvites.mutate(undefined, {
        onSuccess: () => {
          setConfirmAction(null);
          toast.success("Noodle invites cleared.");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not clear Noodle invites."),
      });
      return;
    }
    resetNoodleTimeline.mutate(undefined, {
      onSuccess: () => {
        clearReplyComposer();
        setPostMenuId(null);
        cancelEditingPost();
        cancelEditingReply();
        setConfirmAction(null);
        toast.success("Noodle timeline reset.");
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reset Noodle timeline."),
    });
  };

  const triggerRefresh = () => {
    if (imagePromptReviewItems.length > 0) return;
    if (!settings?.generationConnectionId) {
      toast.error("Choose a generation connection for Noodle first.");
      return;
    }
    const defaultImageConnectionId = readString(imageConnections.find((connection) => connection.defaultForAgents)?.id);
    if (settings.enableImagePrompts && !settings.imageGenerationConnectionId && !defaultImageConnectionId) {
      toast.error("Choose an image generation connection for Noodle first.");
      return;
    }
    refreshNoodle.mutate(
      { personaId: personaAccount?.entityId, connectionId: settings.generationConnectionId },
      {
        onSuccess: (result) => {
          if (result.imagePromptReviewItems.length > 0) {
            setImagePromptReviewItems(result.imagePromptReviewItems);
            return;
          }
          toast.success("Noodle timeline refreshed.");
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not refresh Noodle."),
      },
    );
  };

  const confirmReviewedNoodleImagePrompts = (overrides: ImagePromptOverride[]) => {
    confirmNoodleImagePrompts.mutate(overrides, {
      onSuccess: () => {
        setImagePromptReviewItems([]);
        toast.success("Noodle timeline refreshed.");
      },
      onError: (error) =>
        toast.error(error instanceof Error ? error.message : "Could not generate the reviewed Noodle images."),
    });
  };

  const closeComposeModal = useCallback(() => {
    setComposer(composerValueRef.current);
    setComposeOpen(false);
    setActiveMention(null);
    setActiveComposerTool(null);
  }, []);

  const openComposeModal = (opener: HTMLElement) => {
    composerRestoreFocusRef.current = mobileDrawerOpen ? mobileDrawerTriggerRef.current : opener;
    setComposer(composerValueRef.current);
    setComposeOpen(true);
    setActiveComposerTool(null);
    setActiveReplyComposerTool(null);
    setMobileDrawerOpen(false);
  };

  const scrollTimelineToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      timelineScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const openHomeTimeline = useCallback(() => {
    onNavigate({ mode: "public", view: "home" });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
    scrollTimelineToTop();
  }, [onNavigate, scrollTimelineToTop]);

  const openMobileHomeTimeline = () => {
    setPostSearch("");
    openHomeTimeline();
  };

  const openNotificationTarget = (postId: string, interactionId: string | null) => {
    clearReplyComposer();
    setPostSearch("");
    setTimelineTab("main");
    onNavigate({ mode: "public", view: "home" });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
    setNotificationFocusTarget({ postId, interactionId });
  };

  const openSearch = () => {
    onNavigate({ mode: "public", view: "search" });
    setTimelineTab("main");
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
    scrollTimelineToTop();
  };

  const openNotifications = () => {
    onNavigate({ mode: "public", view: "notifications" });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
  };

  const openSettings = () => {
    onNavigate({ mode: "settings" });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
  };

  const openNoodler = () => {
    onNavigate(settings?.enableNoodler ? { mode: "private", view: "hub" } : { mode: "verification" });
    setAccountSwitcherOpen(false);
    setMobileDrawerOpen(false);
    setActiveComposerTool(null);
  };

  const openNoodlerVerification = () => {
    const hasUnsavedDraft =
      composerHasText || Boolean(attachedImageUrl.trim()) || Boolean(draftPoll) || replyHasText || Boolean(replyImageUrl);
    if (hasUnsavedDraft && !window.confirm("Leave Noodle and discard your unsent post or reply?")) return;
    onNavigate({ mode: "verification" });
  };

  const openProfileConnection = (connection: ProfileConnectionTab | null) => {
    if (navigation.mode !== "public" || navigation.view !== "profile") return;
    onNavigate({ ...navigation, connection });
  };

  const normalizedInviteSearch = inviteSearch.trim().toLowerCase();
  const filteredCharacters = useMemo(
    () =>
      characters
        .filter((character) => readString(character.id))
        .filter((character) => (settings?.allowProfessorMari ?? true) || readString(character.id) !== PROFESSOR_MARI_ID)
        .filter((character) => characterName(character).toLowerCase().includes(normalizedInviteSearch))
        .sort((left, right) => characterName(left).localeCompare(characterName(right))),
    [characters, normalizedInviteSearch, settings?.allowProfessorMari],
  );
  const visibleInviteCharacters = filteredCharacters.slice(0, inviteCharacterLimit);
  const hasMoreInviteCharacters = filteredCharacters.length > visibleInviteCharacters.length;
  const filteredCharacterGroups = useMemo(
    () =>
      characterGroups
        .filter((group) => readString(group.id))
        .filter((group) => characterGroupName(group).toLowerCase().includes(normalizedInviteSearch))
        .sort((left, right) => characterGroupName(left).localeCompare(characterGroupName(right)))
        .slice(0, 24),
    [characterGroups, normalizedInviteSearch],
  );
  const carryoverTargets = useMemo(
    () => new Set(settings?.carryoverModes ?? carryoverTargetsFromLegacy(settings?.carryoverMode)),
    [settings?.carryoverMode, settings?.carryoverModes],
  );

  const toggleCharacterGroupInvite = (groupId: string) => {
    if (!settings) return;
    const current = settings.invitedCharacterGroupIds ?? [];
    const next = current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId];
    saveSettings({ invitedCharacterGroupIds: next });
  };

  const inviteSelectedFolderCharacters = () => {
    if (uninvitedSelectedFolderCharacterIds.length === 0) {
      toast.info("Selected folder characters are already invited.");
      return;
    }
    inviteCharacters.mutate(uninvitedSelectedFolderCharacterIds, {
      onSuccess: (accounts) => {
        toast.success(
          `Invited ${accounts.length} ${accounts.length === 1 ? "character" : "characters"} from selected folders.`,
        );
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not invite folder characters."),
    });
  };

  const uninviteEverybody = () => {
    setConfirmAction({
      kind: "uninvite-everybody",
      title: "Uninvite Everybody",
      message: "This removes all direct Noodle character invites, clears selected invite folders, and turns off random users.",
      confirmLabel: "Uninvite everybody",
    });
  };

  const toggleCarryoverTarget = (target: NoodleCarryoverTarget, checked: boolean) => {
    if (!settings) return;
    const current = new Set(settings.carryoverModes ?? carryoverTargetsFromLegacy(settings.carryoverMode));
    if (checked) current.add(target);
    else current.delete(target);
    const next = NOODLE_CARRYOVER_TARGETS.filter((mode) => current.has(mode));
    saveSettings({
      carryoverModes: next,
      carryoverMode: legacyCarryoverModeFromTargets(next),
    });
  };

  useEffect(() => {
    if (!composeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeComposeModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composeOpen, closeComposeModal]);

  useEffect(() => {
    if (!accountSwitcherOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountSwitcherOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (accountSwitcherRef.current?.contains(event.target)) return;
      setAccountSwitcherOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [accountSwitcherOpen]);

  const settingsContent = (
    <>
      <Section
        title="Noodle Prompt"
        help="Controls the editable base instructions used to write Noodle timeline refreshes. Timeline voice and tone instructions are appended after this prompt."
      >
        <div data-component="NoodleView.PromptSetting" className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--noodle-blue)]/10 text-[var(--noodle-blue)]">
              {noodlePromptLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-[var(--foreground)]">Timeline base prompt</p>
                <span className="rounded-full border border-[var(--noodle-blue)]/30 bg-[var(--noodle-blue)]/10 px-2 py-0.5 text-[0.625rem] font-semibold text-[var(--noodle-blue)]">
                  {noodlePromptOverride?.enabled === true ? "Custom" : "Default"}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-[0.68rem] leading-5 text-[var(--muted-foreground)]">
                {noodlePromptDetail.isError || noodlePromptDefault.isError
                  ? "The Noodle prompt could not be loaded."
                  : noodlePromptText || "Loading the default Noodle prompt…"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void restoreDefaultNoodlePrompt()}
              disabled={!noodlePromptHasOverride || resetNoodlePrompt.isPending}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-[var(--noodle-blue)]/35 px-3 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {resetNoodlePrompt.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Restore default
            </button>
            <button
              type="button"
              onClick={openNoodlePromptEditor}
              disabled={
                noodlePromptLoading || noodlePromptDetail.isError || noodlePromptDefault.isError || !noodlePromptText
              }
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--noodle-blue)]/60 hover:bg-[var(--noodle-blue)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Pencil size={14} aria-hidden="true" className="shrink-0 text-[var(--noodle-blue)]" />
              <span>Edit prompt</span>
            </button>
          </div>
        </div>
      </Section>

      <Section
        title="Invites"
        help="Choose who can participate in Noodle refreshes. Direct character invites, selected character folders, and optional random users form the pool the generator can draw from."
      >
        <div className="space-y-4">
          <ToggleSetting
            label="Professor Mari participates"
            help="When off, Professor Mari is hidden from Noodle account discovery and excluded from future generated posts, replies, reactions, mentions, profiles, and chat carryover. Existing timeline history is preserved."
            checked={settings?.allowProfessorMari ?? true}
            disabled={!settings || updateSettings.isPending}
            onChange={(checked) => saveSettings({ allowProfessorMari: checked })}
          />

          <label className="block space-y-1.5">
            <FieldLabel help="Filters both character folders and individual characters in this invite section.">
              Characters to Invite
            </FieldLabel>
            <input
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              className={fieldClass}
              placeholder="Search characters or folders"
            />
          </label>

          {characterGroups.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setInviteFoldersOpen((open) => !open)}
                className="flex w-full items-center gap-2 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 py-2 text-left text-xs transition-colors hover:border-[var(--noodle-blue)]/60"
                aria-expanded={inviteFoldersOpen}
              >
                <FolderOpen size={15} className="shrink-0 text-[var(--noodle-blue)]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Add from Folder</span>
                  <span className="block truncate text-[0.68rem] text-[var(--muted-foreground)]">
                    Invite every character in selected folders.
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  className={cn(
                    "shrink-0 text-[var(--muted-foreground)] transition-transform",
                    inviteFoldersOpen && "rotate-90",
                  )}
                />
              </button>
              {inviteFoldersOpen && (
                <div className="overflow-hidden rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)]">
                  <div className="max-h-44 space-y-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
                    {filteredCharacterGroups.length > 0 ? (
                      filteredCharacterGroups.map((group) => {
                        const id = readString(group.id);
                        const name = characterGroupName(group);
                        const memberCount = readStringArray(group.characterIds).length;
                        const selected = selectedCharacterGroupIds.has(id);
                        const description = readString(group.description).trim();
                        return (
                          <label
                            key={id}
                            className="flex items-center gap-3 rounded-md p-2 text-xs hover:bg-foreground/5"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!settings || updateSettings.isPending}
                              onChange={() => toggleCharacterGroupInvite(id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{name}</span>
                              <span className="block truncate text-[0.68rem] text-[var(--muted-foreground)]">
                                {memberCount} {memberCount === 1 ? "character" : "characters"}
                                {description ? `, ${description}` : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">No matching folders.</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={inviteSelectedFolderCharacters}
                    disabled={
                      !settings ||
                      updateSettings.isPending ||
                      inviteCharacters.isPending ||
                      uninvitedSelectedFolderCharacterIds.length === 0
                    }
                    className="flex min-h-10 w-full items-center justify-center gap-2 border-t border-[var(--marinara-chat-chrome-panel-border)] px-3 py-2 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {inviteCharacters.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <UserPlus size={14} />
                    )}
                    {folderInviteButtonLabel}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel help="Directly invited characters are eligible regardless of folder selection and get priority in Noodle suggestions and generated activity.">
                Characters
              </FieldLabel>
              <button
                type="button"
                onClick={uninviteEverybody}
                disabled={
                  !settings ||
                  updateSettings.isPending ||
                  inviteCharacter.isPending ||
                  inviteCharacters.isPending ||
                  removeCharacter.isPending ||
                  clearInvites.isPending ||
                  !hasActiveInvites
                }
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--noodle-blue)]/35 px-3 text-[0.68rem] font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clearInvites.isPending ? <Loader2 size={13} className="animate-spin" /> : <UserMinus size={13} />}
                Uninvite everybody
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] [scrollbar-gutter:stable]">
              <button
                type="button"
                className="flex w-full items-center gap-2 border-b border-[var(--marinara-chat-chrome-panel-border)] p-2 text-left transition-colors hover:bg-foreground/5"
                disabled={!settings || updateSettings.isPending}
                onClick={() => saveSettings({ allowRandomUsers: !(settings?.allowRandomUsers ?? false) })}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--noodle-blue)]/10 text-[var(--noodle-blue)]">
                  <Dices size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">Random users</span>
                  <span className="block truncate text-[0.68rem] text-[var(--muted-foreground)]">
                    {(settings?.allowRandomUsers ?? false) ? "Enabled" : "Ambient fake profiles"}
                  </span>
                </span>
                <span className={noodleIconButtonClass}>
                  {(settings?.allowRandomUsers ?? false) ? <UserMinus size={15} /> : <UserPlus size={15} />}
                </span>
              </button>
              {visibleInviteCharacters.map((character) => {
                const id = readString(character.id);
                const name = characterName(character);
                const account = characterAccountByEntity.get(id);
                const invited = account?.invited === true;
                const includedByFolder = folderInvitedCharacterIds.has(id);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 border-b border-[var(--marinara-chat-chrome-panel-border)] p-2 last:border-b-0"
                  >
                    <Avatar
                      account={{
                        displayName: name,
                        avatarUrl: readString(character.avatarPath) || null,
                        avatarCrop: rawCharacterAvatarCrop(character),
                      }}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{name}</p>
                      <p className="text-[0.68rem] text-[var(--muted-foreground)]">
                        {invited ? "Invited" : includedByFolder ? "Included by folder" : "Not invited"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={noodleIconButtonClass}
                      disabled={inviteCharacter.isPending || removeCharacter.isPending}
                      onClick={() =>
                        invited
                          ? removeCharacter.mutate(id, {
                              onError: (error) =>
                                toast.error(error instanceof Error ? error.message : "Could not remove invite."),
                            })
                          : inviteCharacter.mutate(id, {
                              onError: (error) =>
                                toast.error(error instanceof Error ? error.message : "Could not invite character."),
                            })
                      }
                      title={invited ? "Remove direct invite" : "Invite directly"}
                    >
                      {invited ? <UserMinus size={15} /> : <UserPlus size={15} />}
                    </button>
                  </div>
                );
              })}
              {filteredCharacters.length === 0 && (
                <p className="px-3 py-3 text-center text-xs text-[var(--muted-foreground)]">No matching characters.</p>
              )}
              {hasMoreInviteCharacters && (
                <button
                  type="button"
                  onClick={() => setInviteCharacterLimit((limit) => limit + NOODLE_INVITE_PAGE_SIZE)}
                  className="w-full px-3 py-2 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10"
                >
                  Load more ({visibleInviteCharacters.length} of {filteredCharacters.length})
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {settings && (
        <>
          <Section
            title="Refresh"
            help="Controls the model connection and how often Noodle can create a fresh timeline update."
          >
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <FieldLabel help="The text-generation connection used to write new Noodle posts, replies, reposts, likes, and activity digests.">
                  Generation connection
                </FieldLabel>
                <select
                  value={settings.generationConnectionId ?? ""}
                  onChange={(event) => saveSettings({ generationConnectionId: event.target.value || null })}
                  className={fieldClass}
                >
                  <option value="">Choose connection</option>
                  {connections.map((connection) => (
                    <option key={String(connection.id)} value={String(connection.id)}>
                      {String(connection.name ?? connection.model ?? "Connection")}
                    </option>
                  ))}
                </select>
              </label>
              <NumberSetting
                label="Refreshes/day"
                help="How many automatic timeline refreshes Noodle schedules per local day. Refreshes are spread across the day with one randomized time in each window. Set 0 to turn them off."
                value={settings.refreshesPerDay}
                min={0}
                max={24}
                onCommit={(value) => saveSettings({ refreshesPerDay: value })}
              />
              {scheduler && (
                <div
                  className="rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--noodle-blue)]/5 px-3 py-2.5 text-xs"
                  data-component="NoodleView.RefreshSchedule"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
                      <RefreshCw size={14} />
                      Automatic schedule
                    </span>
                    {scheduler.refreshesPerDay > 0 && (
                      <span className="shrink-0 text-[var(--muted-foreground)]">
                        {scheduler.completedSlots}/{scheduler.refreshesPerDay} slots
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 leading-5 text-[var(--muted-foreground)]">{noodleSchedulerSummary(scheduler)}</p>
                  {(scheduler.timezone === "Etc/Unknown" || scheduler.timezone === "local") && (
                    <div
                      className="mt-2 flex gap-2 rounded-md bg-[var(--destructive)]/10 px-2.5 py-2 leading-5 text-[var(--foreground)]"
                      role="alert"
                    >
                      <AlertTriangle className="mt-0.5 shrink-0 text-[var(--destructive)]" size={14} />
                      <p>
                        The server timezone could not be detected. Remove a blank <code>TZ=</code> from your{" "}
                        <code>.env</code>, or set an IANA timezone such as <code>TZ=Europe/Warsaw</code>, then restart
                        Marinara.
                      </p>
                    </div>
                  )}
                  {scheduler.scheduledTimes.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[0.68rem] font-semibold text-[var(--muted-foreground)]">
                        Planned times ({scheduler.timezone})
                      </p>
                      <div className="mt-1 max-h-52 divide-y divide-[var(--noodle-divider)] overflow-y-auto border-y border-[var(--noodle-divider)]">
                        {scheduler.scheduledTimes.map((time, index) => {
                          const completed = (scheduler.completedTimes ?? []).includes(time);
                          const editing = editingRefreshTime === time;
                          const originalClockTime = formatNoodleRefreshTimeInput(time, scheduler.timezone);
                          return (
                            <div
                              key={time}
                              className="flex min-h-10 items-center gap-2 py-1.5"
                              data-noodle-schedule-slot={time}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="mr-2 text-[var(--muted-foreground)]">{index + 1}.</span>
                                <span className="font-semibold text-[var(--foreground)]">
                                  {formatNoodleRefreshTime(time, scheduler.timezone)}
                                </span>
                              </span>
                              {completed ? (
                                <span className="shrink-0 text-[0.65rem] font-semibold text-[var(--muted-foreground)]">
                                  Completed
                                </span>
                              ) : editing ? (
                                <div className="flex shrink-0 items-center gap-1">
                                  <input
                                    type="time"
                                    value={refreshTimeDraft}
                                    onChange={(event) => setRefreshTimeDraft(event.target.value)}
                                    aria-label={`New time for refresh ${index + 1}`}
                                    className="mari-chrome-field h-8 w-[6.5rem] rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--noodle-blue)]"
                                  />
                                  <button
                                    type="button"
                                    onClick={cancelRefreshTimeEdit}
                                    disabled={rescheduleRefresh.isPending}
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:opacity-50"
                                    title="Cancel"
                                    aria-label="Cancel reschedule"
                                  >
                                    <X size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={saveRefreshTimeEdit}
                                    disabled={
                                      rescheduleRefresh.isPending ||
                                      !refreshTimeDraft ||
                                      refreshTimeDraft === originalClockTime
                                    }
                                    className="h-8 rounded-full bg-[var(--noodle-blue)] px-3 text-[0.68rem] font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {rescheduleRefresh.isPending ? "Saving" : "Save"}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => beginRefreshTimeEdit(time)}
                                  disabled={rescheduleRefresh.isPending}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:opacity-50"
                                  title={`Reschedule ${formatNoodleRefreshTime(time, scheduler.timezone)}`}
                                  aria-label={`Reschedule refresh ${index + 1}`}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {scheduler.lastError && (
                    <p className="mt-1 line-clamp-2 leading-5 text-[var(--noodle-blue)]" title={scheduler.lastError}>
                      Waiting: {scheduler.lastError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Active Accounts"
            help="Controls how many eligible characters or random users are active during one generation of the timeline."
          >
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <FieldLabel help="Selects how many invited characters or random users are active during one timeline generation. All uses every eligible account, Random range chooses between Min active and Max active, and Exact count uses one fixed count.">
                  Active selection
                </FieldLabel>
                <select
                  value={settings.participantSelectionMode}
                  onChange={(event) =>
                    saveSettings({
                      participantSelectionMode: event.target
                        .value as NoodleSettingsUpdateInput["participantSelectionMode"],
                    })
                  }
                  className={fieldClass}
                >
                  <option value="random_range">Random range</option>
                  <option value="exact">Exact count</option>
                  <option value="all">All invited</option>
                </select>
              </label>
              {settings.participantSelectionMode === "random_range" && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberSetting
                    label="Min active"
                    help="Lowest number of eligible character or random-user accounts that can participate in one timeline generation."
                    value={settings.participantMin}
                    min={1}
                    max={100}
                    onCommit={(value) => saveSettings({ participantMin: value })}
                  />
                  <NumberSetting
                    label="Max active"
                    help="Highest number of eligible character or random-user accounts that can participate in one timeline generation."
                    value={settings.participantMax}
                    min={1}
                    max={100}
                    onCommit={(value) => saveSettings({ participantMax: value })}
                  />
                </div>
              )}
              {settings.participantSelectionMode === "exact" && (
                <NumberSetting
                  label="Active count"
                  help="Exact number of eligible character or random-user accounts that participate in one timeline generation."
                  value={settings.participantMax}
                  min={1}
                  max={100}
                  onCommit={(value) => saveSettings({ participantMin: value, participantMax: value })}
                />
              )}
            </div>
          </Section>

          <Section title="Activity" help="Limits how much generated Noodle activity one refresh may create.">
            <div className="grid grid-cols-2 gap-2">
              <NumberSetting
                label="Posts"
                help="Maximum new top-level posts the model may create in one refresh."
                value={settings.maxGeneratedPostsPerRefresh}
                min={0}
                max={100}
                onCommit={(value) => saveSettings({ maxGeneratedPostsPerRefresh: value })}
              />
              <NumberSetting
                label="Replies"
                help="Maximum reply interactions the model may add in one refresh."
                value={settings.maxRepliesPerRefresh}
                min={0}
                max={200}
                onCommit={(value) => saveSettings({ maxRepliesPerRefresh: value })}
              />
              <NumberSetting
                label="Reposts"
                help="Maximum repost interactions the model may add in one refresh."
                value={settings.maxRepostsPerRefresh}
                min={0}
                max={100}
                onCommit={(value) => saveSettings({ maxRepostsPerRefresh: value })}
              />
              <NumberSetting
                label="Likes"
                help="Maximum like interactions the model may add in one refresh."
                value={settings.maxLikesPerRefresh}
                min={0}
                max={500}
                onCommit={(value) => saveSettings({ maxLikesPerRefresh: value })}
              />
            </div>
          </Section>

          <Section
            title="Image Generation"
            help="Controls generated post images and whether characters can reuse existing gallery images."
          >
            <div className="space-y-3">
              <ToggleSetting
                label="Image generation"
                help="Generates actual post images from Noodle visual requests, using image connection defaults and the global image style profile system."
                checked={settings.enableImagePrompts}
                disabled={updateSettings.isPending}
                onChange={(checked) => saveSettings({ enableImagePrompts: checked })}
              />
              {settings.enableImagePrompts && (
                <>
                  <label className="block space-y-1.5">
                    <FieldLabel help="The image-generation connection used to create Noodle post images. Leaving it as Default uses the connection marked default for image generation.">
                      Image generation connection
                    </FieldLabel>
                    <select
                      value={settings.imageGenerationConnectionId ?? ""}
                      onChange={(event) => saveSettings({ imageGenerationConnectionId: event.target.value || null })}
                      className={fieldClass}
                    >
                      <option value="">Default image generation connection</option>
                      {imageConnections.map((connection) => (
                        <option key={String(connection.id)} value={String(connection.id)}>
                          {String(connection.name ?? connection.model ?? "Image connection")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <FieldLabel help="Extra instructions passed into the Noodle Post Image prompt override. The full template is also available in Settings, Generations, Image Generation Prompt Overrides.">
                      Prompt instructions
                    </FieldLabel>
                    <textarea
                      value={imageGenerationPromptDraft}
                      onChange={(event) => setImageGenerationPromptDraft(event.target.value)}
                      onBlur={() => {
                        if (imageGenerationPromptDraft !== settings.imageGenerationPrompt) {
                          saveSettings({ imageGenerationPrompt: imageGenerationPromptDraft });
                        }
                      }}
                      className={textareaClass}
                    />
                  </label>
                  <ToggleSetting
                    label="Use avatar references"
                    help="Sends character avatars or preferred full-body references to the image provider when a character's post image is generated."
                    checked={settings.imageGenerationUseAvatarReferences}
                    disabled={updateSettings.isPending}
                    onChange={(checked) => saveSettings({ imageGenerationUseAvatarReferences: checked })}
                  />
                  <ToggleSetting
                    label="Include descriptions"
                    help="Adds character appearance and description notes to the final image prompt before style-profile compilation."
                    checked={settings.imageGenerationIncludeDescriptions}
                    disabled={updateSettings.isPending}
                    onChange={(checked) => saveSettings({ imageGenerationIncludeDescriptions: checked })}
                  />
                  <NumberSetting
                    label="Images/refresh"
                    help="Maximum number of generated post images Noodle may create during each manual or automatic timeline refresh."
                    value={settings.maxImagesPerRefresh}
                    min={0}
                    max={50}
                    onCommit={(value) => saveSettings({ maxImagesPerRefresh: value })}
                  />
                </>
              )}
              <ToggleSetting
                label="Attach gallery images"
                help="Lets characters attach existing images from their own galleries or chats they are in when the timeline writer asks for a gallery attachment."
                checked={settings.allowGalleryImageAttachments}
                disabled={updateSettings.isPending}
                onChange={(checked) => saveSettings({ allowGalleryImageAttachments: checked })}
              />
            </div>
          </Section>

          <Section
            title="Image Understanding"
            help="Lets a vision-capable connection describe timeline images for the Noodle writer, including text-only models."
          >
            <div className="space-y-3">
              <ToggleSetting
                label="Image captioning"
                help="Converts timeline images into concise descriptions before refresh generation, so text-only models can understand what was posted."
                checked={settings.imageCaptioningEnabled}
                disabled={updateSettings.isPending || connections.length === 0}
                onChange={(checked) => saveSettings({ imageCaptioningEnabled: checked })}
              />
              {settings.imageCaptioningEnabled && (
                <label className="block space-y-1.5">
                  <FieldLabel help="Choose a vision-capable text connection. Default uses the Noodle generation connection; select another connection when that model cannot see images.">
                    Captioning connection
                  </FieldLabel>
                  <select
                    value={settings.imageCaptioningConnectionId ?? ""}
                    onChange={(event) => saveSettings({ imageCaptioningConnectionId: event.target.value || null })}
                    className={fieldClass}
                  >
                    <option value="">Use Noodle generation connection</option>
                    {connections.map((connection) => (
                      <option key={String(connection.id)} value={String(connection.id)}>
                        {String(connection.name ?? connection.model ?? "Connection")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </Section>

          <Section
            title="Timeline Writing"
            help="Tunes how the refresh writer approaches tone and long-term memory. Off by default; existing timelines keep their current behavior until you turn this on."
          >
            <div className="space-y-3">
              <ToggleSetting
                label="Enhanced tone & continuity"
                help="When on: each account's voice is grounded more strongly in its own personality instead of a default upbeat tone, accounts are encouraged to react to each other's posts in the same refresh, and older-post recall happens more often and favors posts relevant to currently active accounts. When off, refreshes use the original tone and recall behavior. The Noodle Timeline Voice & Tone prompt override (Settings -> Generations -> Image Generation Prompt Overrides) still lets you rewrite the tone text directly regardless of this toggle."
                checked={settings.enableEnhancedTimelineWriting}
                disabled={updateSettings.isPending}
                onChange={(checked) => saveSettings({ enableEnhancedTimelineWriting: checked })}
              />
              <ToggleSetting
                label="Use generated character schedules"
                help="Includes each participating character's already-generated Conversation schedule for today when one is available. Current time is always included even when this is off."
                checked={settings.includeCharacterSchedules}
                disabled={updateSettings.isPending}
                onChange={(checked) => saveSettings({ includeCharacterSchedules: checked })}
              />
            </div>
          </Section>

          <Section
            title="World / Lore"
            help="Lets Noodle refreshes pull matching lorebook entries into the timeline prompt, the same lorebook system used by chat generation."
          >
            <div className="space-y-3">
              <ToggleSetting
                label="Lorebook context"
                help="Scans recent Noodle activity and character profiles for lorebook keyword matches and includes them as world/lore context. Off by default; existing timelines are unaffected until you turn this on."
                checked={settings.enableLorebookContext}
                disabled={updateSettings.isPending}
                onChange={(checked) => saveSettings({ enableLorebookContext: checked })}
              />
            </div>
          </Section>

          <Section
            title="Carryover"
            help="Controls whether recent Noodle activity is appended to chat, roleplay, or game context."
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <FieldLabel help="Toggle each mode that should receive recent Noodle activity involving the current persona or chat characters. When all three are off, nothing is carried into chat context.">
                  Carryover to chats
                </FieldLabel>
                <div className="grid gap-2 sm:grid-cols-3">
                  <ToggleSetting
                    label="Conversations"
                    compact
                    checked={carryoverTargets.has("conversation")}
                    disabled={updateSettings.isPending}
                    onChange={(checked) => toggleCarryoverTarget("conversation", checked)}
                  />
                  <ToggleSetting
                    label="Roleplays"
                    compact
                    checked={carryoverTargets.has("roleplay")}
                    disabled={updateSettings.isPending}
                    onChange={(checked) => toggleCarryoverTarget("roleplay", checked)}
                  />
                  <ToggleSetting
                    label="Games"
                    compact
                    checked={carryoverTargets.has("game")}
                    disabled={updateSettings.isPending}
                    onChange={(checked) => toggleCarryoverTarget("game", checked)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberSetting
                  label="Carry hours"
                  help="How far back Noodle looks for activity digests when adding recent social media context to chats."
                  value={settings.carryoverHours}
                  min={1}
                  max={720}
                  onCommit={(value) => saveSettings({ carryoverHours: value })}
                />
                <NumberSetting
                  label="Carry items"
                  help="Maximum number of recent Noodle activity summaries appended to a chat context."
                  value={settings.carryoverMaxItems}
                  min={1}
                  max={50}
                  onCommit={(value) => saveSettings({ carryoverMaxItems: value })}
                />
              </div>
            </div>
          </Section>

          <Section
            title="NoodleR Access"
            help="Keeps private creator accounts isolated from the public Noodle timeline."
          >
            <div className="space-y-3">
              <ToggleSetting
                label="Enable NoodleR"
                help="Opt in to private creator accounts. Turning this off hides private account data from NoodleR queries without changing the public timeline."
                checked={settings.enableNoodler}
                disabled={updateSettings.isPending}
                onChange={(checked) => {
                  if (checked) openNoodlerVerification();
                  else saveSettings({ enableNoodler: false });
                }}
              />
              <p className="rounded-lg border border-[var(--noodle-divider)] bg-[var(--noodle-blue)]/10 px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)]">
                NoodleR is still being implemented and is not usable or finalized yet. Please do not submit bug reports
                or feature requests for it while it is in development.
              </p>
              {settings.enableNoodler && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={openNoodler}
                    className="flex min-h-10 w-full items-center justify-center rounded-md border border-[var(--noodle-blue)]/40 bg-[var(--noodle-blue)]/10 px-3 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/15"
                  >
                    Open NoodleR
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate({ mode: "private", view: "profiles" })}
                    className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--noodle-blue)]/40 bg-[var(--noodle-blue)]/10 px-3 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/15"
                  >
                    <Settings2 size={15} />
                    Manage stage profiles
                  </button>
                </div>
              )}
            </div>
          </Section>

          <Section
            title="Reset Noodle"
            help="Clears timeline content while keeping profiles, follows, invites, and Noodle settings."
          >
            <button
              type="button"
              onClick={resetTimeline}
              disabled={resetNoodleTimeline.isPending}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--noodle-blue)]/60 hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetNoodleTimeline.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} className="text-[var(--noodle-blue)]" />
              )}
              {resetNoodleTimeline.isPending ? "Resetting Noodle" : "Reset Noodle Timeline"}
            </button>
          </Section>
        </>
      )}
    </>
  );

  const renderPostArticle = (post: NoodlePost) => (
    <NoodlePostCard
      key={post.id}
      post={{ ...post, title: null, interactions: interactionsByPostId.get(post.id) ?? [] }}
      ctx={{
        postManagement: true,
        accountById,
        accountByHandle,
        personaAccount,
        postMenuId,
        setPostMenuId,
        editingPostId,
        editingPostContent,
        setEditingPostContent,
        replyPostId,
        replyParentInteractionId,
        replyText,
        replyHasText,
        setReplyText,
        activeReplyComposerTool,
        setActiveReplyComposerTool,
        highlightedInteractionId,
        mediaPickerTab,
        setMediaPickerTab,
        replyComposerRef,
        replyValueRef,
        replyMediaToolRef,
        openProfile,
        startEditingPost,
        deleteNoodlePost,
        cancelEditingPost,
        saveEditedPost,
        reactToPost,
        reactToReply,
        voteInPoll,
        openReplyComposer,
        handleReplyChange,
        handleReplyKeyDown,
        clearReplyComposer,
        submitReply,
        appendToReply,
        reactionPendingFor,
        createInteractionPendingFor,
        updatePostPending: updatePost.isPending,
        media: {
          setImageLightbox,
          replyImageUrl,
          setReplyImageUrl,
          replyImageUrlDraft,
          setReplyImageUrlDraft,
          replyImageToolRef,
          replyImageFileRef,
          applyReplyImageUrl,
          uploadGlobalImages,
        },
        replyManagement: {
          editingReplyId,
          editingReplyContent,
          setEditingReplyContent,
          startEditingReply,
          cancelEditingReply,
          saveEditedReply,
          deleteNoodleReply,
          updateInteraction,
          deleteInteraction,
        },
        mentions: {
          activeReplyMention,
          activeReplyMentionIndex,
          replyMentionSuggestions,
          selectReplyMention,
        },
      }}
    />
  );

  const renderAccountRow = (account: NoodleAccount, options?: { showFollowButton?: boolean }) => {
    const followable = canFollowAccount(account);
    const followed = followedAccountIds.has(account.id);
    return (
      <div
        key={account.id}
        className="flex items-start gap-3 border-b border-[var(--noodle-divider)] px-4 py-3 last:border-b-0"
      >
        <button
          type="button"
          onClick={() => openProfile(account)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left transition-colors hover:text-[var(--noodle-blue)]"
        >
          <Avatar account={account} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{account.displayName}</span>
            <span className="block truncate text-sm text-[var(--muted-foreground)]">@{account.handle}</span>
            {account.bio.trim() && (
              <span className="mt-1 line-clamp-2 block text-sm leading-5 text-[var(--foreground)]">{account.bio}</span>
            )}
          </span>
        </button>
        {options?.showFollowButton && followable ? (
          <button
            type="button"
            onClick={() => updateFollowedAccount(account, !followed)}
            disabled={updateAccountFollow.isPending}
            className={cn(
              "mt-1 h-8 shrink-0 rounded-full px-4 text-xs font-bold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
              followed
                ? "border border-[var(--noodle-divider)] text-[var(--foreground)]"
                : "bg-[var(--foreground)] text-[var(--background)]",
            )}
          >
            {followed ? "Following" : "Follow"}
          </button>
        ) : null}
      </div>
    );
  };

  const renderFollowNotification = (item: (typeof notificationFollowAccounts)[number]) => (
    <div key={item.account.id} className="flex items-start gap-3 border-b border-[var(--noodle-divider)] px-4 py-4">
      <button
        type="button"
        onClick={() => openProfile(item.account)}
        className="rounded-full transition-opacity hover:opacity-80"
        title={`View @${item.account.handle}`}
      >
        <Avatar account={item.account} />
      </button>
      <button
        type="button"
        onClick={() => openProfile(item.account)}
        className="min-w-0 flex-1 text-left transition-colors hover:text-[var(--noodle-blue)]"
      >
        <span className="block truncate text-sm font-bold">{item.account.displayName}</span>
        <span className="block truncate text-sm text-[var(--muted-foreground)]">@{item.account.handle}</span>
        <span className="mt-1 block text-sm leading-5">followed you</span>
      </button>
    </div>
  );

  const renderLikeNotification = (item: (typeof notificationLikes)[number]) => {
    const actor = item.actorAccount ?? item.actorSnapshot;
    return (
      <div
        key={item.interaction.id}
        className="flex items-start gap-3 border-b border-[var(--noodle-divider)] px-4 py-4"
      >
        {actor ? (
          <button
            type="button"
            onClick={() => openProfile(item.actorAccount)}
            disabled={!item.actorAccount}
            className="rounded-full transition-opacity enabled:hover:opacity-80 disabled:cursor-default"
            title={item.actorAccount ? `View @${item.actorAccount.handle}` : undefined}
          >
            <Avatar account={actor} />
          </button>
        ) : (
          <Heart size={28} className="text-[var(--noodle-blue)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => openProfile(item.actorAccount)}
              disabled={!item.actorAccount}
              className="font-bold transition-colors enabled:hover:text-[var(--noodle-blue)] disabled:cursor-default"
            >
              {actor?.displayName ?? "Noodle User"}
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">@{actor?.handle ?? "noodle"}</span>
            <span className="text-xs text-[var(--muted-foreground)]">{formatTime(item.interaction.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm">liked your {item.targetReply ? "comment" : "post"}</p>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--muted-foreground)]">
            {item.targetReply?.content || (item.targetReply?.imageUrl ? "Shared an image." : item.post.content)}
          </p>
        </div>
      </div>
    );
  };

  const renderReplyNotification = (item: (typeof notificationReplyItems)[number]) => {
    const actor = item.actorAccount ?? item.actorSnapshot;
    return (
      <div key={item.id} className="flex items-start gap-3 border-b border-[var(--noodle-divider)] px-4 py-4">
        {actor ? (
          <button
            type="button"
            onClick={() => openProfile(item.actorAccount)}
            disabled={!item.actorAccount}
            className="rounded-full transition-opacity enabled:hover:opacity-80 disabled:cursor-default"
            title={item.actorAccount ? `View @${item.actorAccount.handle}` : undefined}
          >
            <Avatar account={actor} />
          </button>
        ) : (
          <MessageCircle size={28} className="text-[var(--noodle-blue)]" />
        )}
        <button
          type="button"
          onClick={() => openNotificationTarget(item.post.id, item.interactionId)}
          data-noodle-notification-target={item.interactionId ?? item.post.id}
          data-noodle-notification-kind={item.kind}
          className="-m-2 min-w-0 flex-1 rounded-lg p-2 text-left outline-none transition-colors hover:bg-[var(--noodle-blue)]/10 focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70"
          title={item.kind === "reply" ? "Open reply in timeline" : "Open post in timeline"}
          aria-label={
            item.kind === "reply"
              ? `Open reply from ${actor?.displayName ?? "Noodle user"} in timeline`
              : `Open mention from ${actor?.displayName ?? "Noodle user"} in timeline`
          }
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold">{actor?.displayName ?? "Noodle User"}</span>
            <span className="text-xs text-[var(--muted-foreground)]">@{actor?.handle ?? "noodle"}</span>
            <span className="text-xs text-[var(--muted-foreground)]">{formatTime(item.createdAt)}</span>
          </div>
          <p className="mt-1 text-sm">
            {item.kind === "reply" ? `replied to your ${item.replyTarget ?? "post"}` : "mentioned you"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-5">{item.content}</p>
          {item.kind === "reply" && (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">{item.post.content}</p>
          )}
        </button>
      </div>
    );
  };

  const renderComposerToolPopovers = ({
    imageRef,
    pollRef,
    mediaRef,
  }: {
    imageRef: RefObject<HTMLDivElement | null>;
    pollRef: RefObject<HTMLDivElement | null>;
    mediaRef: RefObject<HTMLDivElement | null>;
  }) => (
    <>
      {activeComposerTool === "image" && (
        <NoodleToolPopover
          title="Attach image"
          anchorRef={imageRef}
          onClose={() => setActiveComposerTool(null)}
          modalOwned={composeOpen}
          wide
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => imageFileRef.current?.click()}
              disabled={uploadGlobalImages.isPending}
              className="h-9 w-full rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploadGlobalImages.isPending ? "Uploading..." : "Upload From Device"}
            </button>
            <div className="flex items-center gap-2 text-[0.625rem] font-semibold uppercase tracking-normal text-[var(--marinara-chat-chrome-panel-muted)]">
              <span className="h-px flex-1 bg-[var(--noodle-divider)]" />
              or
              <span className="h-px flex-1 bg-[var(--noodle-divider)]" />
            </div>
            <label className="block space-y-1.5">
              <span className={labelClass}>Image URL</span>
              <input
                value={imageUrlDraft}
                onChange={(event) => setImageUrlDraft(event.target.value)}
                placeholder="https://..."
                className={fieldClass}
              />
            </label>
            <button
              type="button"
              onClick={applyImageUrl}
              className="h-9 w-full rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-bold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10"
            >
              Attach URL
            </button>
          </div>
        </NoodleToolPopover>
      )}
      {activeComposerTool === "poll" && (
        <NoodleToolPopover
          title={draftPoll ? "Edit poll" : "Create poll"}
          anchorRef={pollRef}
          onClose={() => setActiveComposerTool(null)}
          modalOwned={composeOpen}
          wide
        >
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className={labelClass}>Question</span>
              <input
                value={pollQuestion}
                onChange={(event) => setPollQuestion(event.target.value)}
                className={fieldClass}
                placeholder="Ask a question"
              />
            </label>
            <div className="space-y-2">
              {pollOptions.map((option, index) => (
                <input
                  key={index}
                  value={option}
                  onChange={(event) =>
                    setPollOptions((current) =>
                      current.map((entry, optionIndex) => (optionIndex === index ? event.target.value : entry)),
                    )
                  }
                  className={fieldClass}
                  placeholder={`Option ${index + 1}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPollOptions((current) => (current.length >= 4 ? current : [...current, ""]))}
                className="h-8 flex-1 rounded-full border border-[var(--noodle-divider)] px-3 text-xs font-semibold text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
              >
                Add Option
              </button>
              <button
                type="button"
                onClick={applyPoll}
                className="h-8 flex-1 rounded-full bg-[var(--noodle-blue)] px-3 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90"
              >
                {draftPoll ? "Update Poll" : "Add Poll"}
              </button>
            </div>
          </div>
        </NoodleToolPopover>
      )}
      {activeComposerTool === "media" && (
        <NoodleAnchoredPopover anchorRef={mediaRef} modalOwned={composeOpen} wide>
          <ConversationMediaPickerPanel
            tabs={NOODLE_MEDIA_PICKER_TABS}
            activeTab={mediaPickerTab}
            onActiveTabChange={setMediaPickerTab}
            onClose={() => setActiveComposerTool(null)}
            onEmojiSelect={appendToComposer}
            onGifSelect={(gifUrl) => {
              setAttachedImageUrl(gifUrl);
              setActiveComposerTool(null);
            }}
            onStickerSelect={(name) => {
              appendToComposer(`sticker:${name}:`);
              setActiveComposerTool(null);
            }}
            className="w-full !border-[var(--marinara-chat-chrome-panel-border)] !bg-[var(--background)] !text-[var(--foreground)] shadow-2xl shadow-black/35"
          />
        </NoodleAnchoredPopover>
      )}
    </>
  );

  const mobileSearchContent = (
    <div className="min-h-full" data-component="NoodleView.MobileSearch">
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 px-2 py-3 backdrop-blur">
        <MobileTimelineBackButton onClick={openMobileHomeTimeline} />
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-[var(--accent)] px-4 text-sm ring-1 ring-inset ring-[var(--noodle-divider)] transition-colors focus-within:ring-[var(--noodle-blue)]">
          <Search size={18} className="shrink-0 text-[var(--noodle-blue)]" />
          <input
            type="search"
            value={postSearch}
            onChange={(event) => setPostSearch(event.target.value)}
            placeholder="Search posts or @users"
            aria-label="Search Noodle"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          {postSearch.trim() && (
            <button
              type="button"
              onClick={() => setPostSearch("")}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {rawPostSearch && (
        <section className="border-b border-[var(--noodle-divider)]" aria-labelledby="noodle-mobile-search-results">
          <div className="border-b border-[var(--noodle-divider)] px-4 py-3">
            <h2 id="noodle-mobile-search-results" className="text-lg font-bold">
              Search results
            </h2>
          </div>
          {isAccountSearch ? (
            accountSearchResults.length > 0 ? (
              <div>{accountSearchResults.map((account) => renderAccountRow(account, { showFollowButton: true }))}</div>
            ) : (
              <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">No accounts found.</p>
            )
          ) : timelinePosts.length > 0 ? (
            <div>{timelinePosts.map(renderPostArticle)}</div>
          ) : (
            <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">No posts found.</p>
          )}
        </section>
      )}

      <section aria-labelledby="noodle-mobile-who-to-follow">
        <div className="border-b border-[var(--noodle-divider)] px-4 py-3">
          <h2 id="noodle-mobile-who-to-follow" className="text-lg font-bold">
            Who to follow
          </h2>
        </div>
        {suggestedCharacters.length > 0 ? (
          <div className="divide-y divide-[var(--noodle-divider)]">
            {suggestedCharacters.map((character) => (
              <div key={character.accountId} className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => openProfile(character.account)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:text-[var(--noodle-blue)]"
                >
                  <Avatar account={character.account} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{character.name}</span>
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">@{character.handle}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => updateFollowedAccount(character.account, true)}
                  disabled={updateAccountFollow.isPending}
                  className="h-8 rounded-full bg-[var(--foreground)] px-4 text-xs font-bold text-[var(--background)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Follow
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--muted-foreground)]">
            {followableCharacterAccounts.length > 0 ? "You're following everyone!" : "No one's cooking yet…"}
          </p>
        )}
      </section>
    </div>
  );

  const rightRailContent = (
    <aside className="hidden w-[22rem] shrink-0 px-4 py-3 xl:block">
      <div className="sticky top-3 space-y-4">
        <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--noodle-divider)] bg-[var(--background)] px-4 text-sm transition-colors focus-within:border-[var(--noodle-blue)]">
          <Search size={17} className="shrink-0 text-[var(--noodle-blue)]" />
          <input
            value={postSearch}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Search posts or @users"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          {postSearch.trim() && (
            <button
              type="button"
              onClick={() => setPostSearch("")}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <section className="overflow-hidden rounded-2xl border border-[var(--noodle-divider)] bg-[var(--background)]">
          <div className="border-b border-[var(--noodle-divider)] px-4 py-3">
            <h3 className="text-lg font-bold">Who to follow</h3>
          </div>
          {suggestedCharacters.length > 0 ? (
            <div className="divide-y divide-[var(--noodle-divider)]">
              {suggestedCharacters.map((character) => (
                <div key={character.accountId} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => openProfile(character.account)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:text-[var(--noodle-blue)]"
                  >
                    <Avatar account={character.account} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{character.name}</span>
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">@{character.handle}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFollowedAccount(character.account, true)}
                    disabled={updateAccountFollow.isPending}
                    className="h-8 rounded-full bg-[var(--foreground)] px-4 text-xs font-bold text-[var(--background)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-5 text-sm text-[var(--muted-foreground)]">
              {followableCharacterAccounts.length > 0 ? "You're following everyone!" : "No one's cooking yet…"}
            </p>
          )}
        </section>
      </div>
    </aside>
  );

  const rightRail =
    activeNoodleView === "settings" ? (
      <aside className="hidden w-[22rem] shrink-0 px-4 py-3 xl:block" aria-hidden="true" />
    ) : (
      rightRailContent
    );

  return (
    <NoodleShell
      appMode="noodle"
      activeView={
        activeNoodleView === "home" ||
        activeNoodleView === "search" ||
        activeNoodleView === "notifications" ||
        activeNoodleView === "profile" ||
        activeNoodleView === "settings"
          ? activeNoodleView
          : null
      }
      personaAccount={personaAccount}
      sortedPersonaAccounts={sortedPersonaAccounts}
      visiblePersonaAccounts={visiblePersonaAccounts}
      linkedPublicAccountIds={linkedPublicAccountIds}
      onLoadMorePersonaAccounts={() =>
        setPersonaAccountLimit((current) => current + NOODLE_PERSONA_SWITCHER_PAGE_SIZE)
      }
      onSwitchPersona={switchPersona}
      accountSwitcherOpen={accountSwitcherOpen}
      onAccountSwitcherOpenChange={setAccountSwitcherOpen}
      accountSwitcherRef={accountSwitcherRef}
      mobileDrawerOpen={mobileDrawerOpen}
      onMobileDrawerOpenChange={setMobileDrawerOpen}
      mobileAccountSwitcherOpen={mobileAccountSwitcherOpen}
      onMobileAccountSwitcherOpenChange={setMobileAccountSwitcherOpen}
      notificationCount={notificationCount}
      enableNoodler={settings?.enableNoodler ?? false}
      onOpenHome={openHomeTimeline}
      onOpenMobileHome={openMobileHomeTimeline}
      onOpenNoodler={openNoodler}
      onOpenSearch={openSearch}
      onOpenNotifications={openNotifications}
      onOpenProfile={openOwnProfile}
      onOpenSettings={openSettings}
      onCompose={openComposeModal}
      rightRail={rightRail}
      overlays={
        <>
          <BrowserChrome />
          <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
          <input
            ref={replyImageFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleReplyImageFile}
          />
          {imageLightbox && (
            <ChatImageLightbox
              image={imageLightbox}
              alt={imageLightbox.prompt || "Noodle image"}
              pinEnabled={false}
              onClose={() => setImageLightbox(null)}
            />
          )}
        </>
      }
    >
      <div
        ref={timelineScrollRef}
        data-component="NoodleView.TimelineScroller"
        className="min-h-0 flex-1 overflow-y-auto"
      >
            <div className="min-h-full w-full border-x border-[var(--noodle-divider)] bg-[var(--background)]">
              {activeNoodleView === "home" && (
                <div
                  className="sticky top-0 z-30 grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 px-3 backdrop-blur lg:hidden"
                  data-component="NoodleView.MobileHeader"
                >
                  <button
                    ref={mobileDrawerTriggerRef}
                    type="button"
                    onClick={() => setMobileDrawerOpen(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--accent)]"
                    title="Open account menu"
                    aria-label="Open Noodle account menu"
                  >
                    {personaAccount ? (
                      <Avatar account={personaAccount} size="sm" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--noodle-blue)]/15 ring-1 ring-[var(--noodle-blue)]/25">
                        <AtSign size={18} />
                      </span>
                    )}
                  </button>
                  <NoodleLogo className="mx-auto h-9 w-14" />
                  <span aria-hidden="true" />
                </div>
              )}
              {activeNoodleView === "home" &&
                (isAccountSearch ? (
                  <div className="sticky top-14 z-20 flex h-12 items-center gap-3 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 px-4 backdrop-blur lg:top-0">
                    <AtSign size={19} className="text-[var(--noodle-blue)]" />
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold">Accounts</h2>
                      <p className="truncate text-[0.68rem] text-[var(--muted-foreground)]">
                        {accountSearchTerm ? `@${accountSearchTerm}` : "Type a handle after @"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="sticky top-14 z-20 grid grid-cols-2 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 backdrop-blur lg:top-0">
                    {TIMELINE_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTimelineTab(tab.id)}
                        className={cn(
                          "relative flex h-12 items-center justify-center text-sm font-bold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
                          timelineTab === tab.id && "text-[var(--foreground)]",
                        )}
                        aria-pressed={timelineTab === tab.id}
                      >
                        {tab.label}
                        {timelineTab === tab.id && (
                          <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[var(--noodle-blue)]" />
                        )}
                      </button>
                    ))}
                  </div>
                ))}

              {activeNoodleView === "home" && !isAccountSearch && !composeOpen && (
                <NoodleComposerShell
                  dataComponent="NoodleView.InlineComposer"
                  avatar={
                    personaAccount ? (
                      <Avatar account={personaAccount} />
                    ) : (
                      <AtSign size={28} className="text-[var(--noodle-blue)]" />
                    )
                  }
                  tools={
                    <NoodleComposerToolRow
                      image={{
                        ref: imageToolRef,
                        active: activeComposerTool === "image",
                        onClick: () => setActiveComposerTool((current) => (current === "image" ? null : "image")),
                      }}
                      poll={{
                        ref: pollToolRef,
                        active: activeComposerTool === "poll" || Boolean(draftPoll),
                        onClick: togglePollComposer,
                      }}
                      media={{
                        ref: mediaToolRef,
                        active: activeComposerTool === "media",
                        onClick: () => setActiveComposerTool((current) => (current === "media" ? null : "media")),
                      }}
                    />
                  }
                  action={
                    <button
                      type="button"
                      onClick={submitPost}
                      disabled={!canSubmitPost || createPost.isPending}
                      className="h-8 rounded-full bg-[var(--noodle-blue)] px-5 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Post
                    </button>
                  }
                  popovers={
                    !composeOpen &&
                    renderComposerToolPopovers({
                      imageRef: imageToolRef,
                      pollRef: pollToolRef,
                      mediaRef: mediaToolRef,
                    })
                  }
                >
                  <textarea
                    ref={inlineComposerRef}
                    defaultValue={composer}
                    onChange={handleComposerChange}
                    onBlur={() => setComposer(composerValueRef.current)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={!personaAccount}
                    placeholder="What's simmering?"
                    aria-autocomplete="list"
                    aria-controls={activeMention && !composeOpen ? "noodle-inline-mention-list" : undefined}
                    aria-expanded={Boolean(activeMention && !composeOpen)}
                    aria-activedescendant={
                      activeMention && !composeOpen && mentionSuggestions.length > 0
                        ? `noodle-inline-mention-list-option-${Math.min(
                            activeMentionIndex,
                            mentionSuggestions.length - 1,
                          )}`
                        : undefined
                    }
                    className="min-h-20 w-full resize-none border-0 bg-transparent py-2 text-[1rem] leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-60"
                  />
                  {!composeOpen && renderComposerMentionSuggestions("noodle-inline-mention-list")}
                  {renderDraftPoll()}
                  {attachedImageUrl && (
                    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--noodle-divider)] bg-[var(--noodle-blue)]/10">
                      <img src={attachedImageUrl} alt="" className="max-h-52 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--noodle-blue)]">
                        <span className="min-w-0 truncate">Attached image</span>
                        <button
                          type="button"
                          onClick={() => setAttachedImageUrl("")}
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--noodle-blue)]/15"
                          title="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </NoodleComposerShell>
              )}

              {activeNoodleView === "home" && !isAccountSearch && (
                <div className="border-b border-[var(--noodle-divider)] px-4 py-2">
                  <button
                    type="button"
                    onClick={triggerRefresh}
                    disabled={refreshNoodle.isPending || !settings || imagePromptReviewItems.length > 0}
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Refresh timeline"
                    aria-label="Refresh timeline"
                  >
                    {refreshNoodle.isPending ? (
                      <Loader2 size={17} className="!text-[var(--noodle-blue)] animate-spin" />
                    ) : (
                      <RefreshCw size={17} className="!text-[var(--noodle-blue)]" />
                    )}
                    {refreshNoodle.isPending ? "Refreshing" : "Refresh timeline"}
                  </button>
                </div>
              )}

              {activeNoodleView === "search" ? (
                mobileSearchContent
              ) : activeNoodleView === "notifications" ? (
                <div className="min-h-full">
                  <div className="sticky top-0 z-20 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 backdrop-blur">
                    <div className="flex min-h-14 items-center gap-3 px-2 py-2 lg:px-4">
                      <MobileTimelineBackButton onClick={openMobileHomeTimeline} />
                      <Bell size={22} className="hidden text-[var(--noodle-blue)] lg:block" />
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold">Notifications</h2>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {personaAccount ? `@${personaAccount.handle}` : "Choose a persona account"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3">
                      {NOTIFICATION_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setNotificationTab(tab.id)}
                          className={cn(
                            "relative flex h-12 items-center justify-center text-sm font-bold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
                            notificationTab === tab.id && "text-[var(--foreground)]",
                          )}
                        >
                          {tab.label}
                          {notificationTab === tab.id && (
                            <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[var(--noodle-blue)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {notificationTab === "likes" ? (
                    notificationLikes.length > 0 ? (
                      <div>{notificationLikes.map(renderLikeNotification)}</div>
                    ) : (
                      <div className="px-8 py-14 text-center">
                        <Heart size={38} className="mx-auto mb-4 text-[var(--noodle-blue)]" />
                        <p className="text-base font-bold">No likes yet.</p>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                          Likes on your Noodle posts will show here.
                        </p>
                      </div>
                    )
                  ) : notificationTab === "follows" ? (
                    notificationFollowAccounts.length > 0 ? (
                      <div>{notificationFollowAccounts.map(renderFollowNotification)}</div>
                    ) : (
                      <div className="px-8 py-14 text-center">
                        <Bell size={38} className="mx-auto mb-4 text-[var(--noodle-blue)]" />
                        <p className="text-base font-bold">No follows yet.</p>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                          Accounts following you will show here.
                        </p>
                      </div>
                    )
                  ) : notificationReplyItems.length > 0 ? (
                    <div>{notificationReplyItems.map(renderReplyNotification)}</div>
                  ) : (
                    <div className="px-8 py-14 text-center">
                      <MessageCircle size={38} className="mx-auto mb-4 text-[var(--noodle-blue)]" />
                      <p className="text-base font-bold">No replies or mentions yet.</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                        Replies to your posts and @{personaAccount?.handle ?? "mentions"} will show here.
                      </p>
                    </div>
                  )}
                </div>
              ) : activeNoodleView === "settings" ? (
                <div className="min-h-full">
                  <div className="border-b border-[var(--noodle-divider)] px-2 py-3 lg:px-4 lg:py-5">
                    <div className="flex items-center gap-3">
                      <MobileTimelineBackButton onClick={openMobileHomeTimeline} />
                      <Settings2 size={22} className="hidden text-[var(--noodle-blue)] lg:block" />
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold">Noodle settings</h2>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          {personaAccount ? `@${personaAccount.handle}` : "Choose a persona account"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {settingsContent}
                </div>
              ) : activeNoodleView === "profile" && profileConnectionTab ? (
                <div className="min-h-full">
                  <div className="sticky top-0 z-20 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 backdrop-blur">
                    <div className="flex min-h-14 items-center gap-3 px-3 py-2">
                      <MobileTimelineBackButton onClick={openMobileHomeTimeline} />
                      <button
                        type="button"
                        onClick={() => openProfileConnection(null)}
                        className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 lg:flex"
                        title="Back to profile"
                        aria-label="Back to profile"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold">{profilePreviewAccount.displayName}</h2>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">
                          @{profileDisplayHandle || "noodle"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2">
                      {PROFILE_CONNECTION_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => openProfileConnection(tab.id)}
                          className={cn(
                            "relative flex h-12 items-center justify-center text-sm font-bold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
                            profileConnectionTab === tab.id && "text-[var(--foreground)]",
                          )}
                        >
                          {tab.label}
                          {profileConnectionTab === tab.id && (
                            <span className="absolute bottom-0 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-[var(--noodle-blue)]" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  {profileConnectionAccounts.length > 0 ? (
                    <div>
                      {profileConnectionAccounts.map((account) =>
                        renderAccountRow(account, { showFollowButton: true }),
                      )}
                    </div>
                  ) : (
                    <div className="px-8 py-14 text-center">
                      <p className="text-base font-bold">
                        {profileConnectionTab === "following" ? "Not following anyone yet." : "No followers yet."}
                      </p>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                        Nothing boiling here yet.
                      </p>
                    </div>
                  )}
                </div>
              ) : activeNoodleView === "profile" ? (
                <NoodleProfileSurface
                  mobileHeader={
                    <div className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-[var(--noodle-divider)] bg-[var(--background)]/95 px-2 py-2 backdrop-blur lg:hidden">
                      <MobileTimelineBackButton onClick={openMobileHomeTimeline} />
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold">Profile</h2>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">@{profileDisplayHandle || "noodle"}</p>
                      </div>
                    </div>
                  }
                  account={profilePreviewAccount}
                  displayHandle={profileDisplayHandle}
                  banner={{
                    url: profileBannerPreview,
                    canEdit: canEditViewedProfile,
                    uploadTarget: profileUploadTarget,
                    fileRef: bannerFileRef,
                    onFileChange: (event) => handleProfileImageFile("banner", event),
                  }}
                  avatarUpload={{
                    canEdit: canEditViewedProfile,
                    uploadTarget: profileUploadTarget,
                    fileRef: avatarFileRef,
                    onFileChange: (event) => handleProfileImageFile("avatar", event),
                  }}
                  editor={
                    canEditViewedProfile
                      ? {
                          isEditing: isEditingProfile,
                          onStartEditing: () => setProfileEditing(true),
                          onSave: saveProfile,
                          canSave: canSaveProfile && Boolean(viewedProfileAccount),
                          isSaving: updateAccountProfile.isPending,
                          name: profileName,
                          onNameChange: setProfileName,
                          handle: profileHandle,
                          onHandleChange: setProfileHandle,
                          bio: profileBio,
                          onBioChange: setProfileBio,
                          location: profileLocation,
                          onLocationChange: setProfileLocation,
                        }
                      : undefined
                  }
                  followAction={
                    canFollowViewedProfile && viewedProfileAccount
                      ? {
                          followed: viewedProfileFollowed,
                          pending: updateAccountFollow.isPending,
                          onToggle: () => updateFollowedAccount(viewedProfileAccount, !viewedProfileFollowed),
                        }
                      : undefined
                  }
                  secondaryActions={
                    canCreateStageProfileFromViewed && viewedProfileAccount ? (
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({
                            mode: "private",
                            view: "create-profile",
                            publicAccountId: viewedProfileAccount.id,
                          })
                        }
                        className="h-9 rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]"
                      >
                        Create stage profile
                      </button>
                    ) : undefined
                  }
                  bioContent={
                    profileBioPreview ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                        <NoodleCustomEmojiText
                          text={profileBioPreview}
                          emojiMap={noodleCustomEmojiMap}
                          keyPrefix={`noodle-profile-bio-${viewedProfileAccount?.id ?? "preview"}`}
                        />
                      </p>
                    ) : null
                  }
                  location={profileLocationPreview}
                  connections={{
                    followingCount: profileFollowingCount,
                    followerCount: profileFollowerCount,
                    onOpenFollowing: () => openProfileConnection("following"),
                    onOpenFollowers: () => openProfileConnection("followers"),
                  }}
                  activeTab={profileTab}
                  onTabChange={setProfileTab}
                  postList={
                    profileVisiblePosts.length > 0 ? (
                      profileVisiblePosts.map(renderPostArticle)
                    ) : (
                      <div className="px-8 py-14 text-center">
                        <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                          Nothing boiling here yet.
                        </p>
                      </div>
                    )
                  }
                />
              ) : isLoading ? (
                <div className="space-y-0">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex gap-3 border-b border-[var(--noodle-divider)] px-4 py-4">
                      <div className="h-11 w-11 shrink-0 rounded-full bg-[var(--muted)]" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="h-3 w-40 rounded bg-[var(--muted)]" />
                        <div className="h-3 w-full rounded bg-[var(--muted)]" />
                        <div className="h-3 w-2/3 rounded bg-[var(--muted)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : isAccountSearch ? (
                accountSearchResults.length > 0 ? (
                  <div>
                    {accountSearchResults.map((account) => renderAccountRow(account, { showFollowButton: true }))}
                  </div>
                ) : (
                  <div className="px-8 py-14 text-center">
                    <AtSign size={38} className="mx-auto mb-4 text-[var(--noodle-blue)]" />
                    <p className="text-base font-bold">No accounts found.</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                      Try searching by handle, like @mari.
                    </p>
                  </div>
                )
              ) : normalizedPostSearch && timelinePosts.length === 0 ? (
                <div className="px-8 py-14 text-center">
                  <p className="text-base font-bold">No posts found.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                    Try a different search.
                  </p>
                </div>
              ) : timelineTab === "following" && baseTimelinePosts.length === 0 ? (
                <div className="px-8 py-14 text-center">
                  <AtSign size={38} className="mx-auto mb-4 text-[var(--noodle-blue)]" />
                  <p className="text-base font-bold">Nothing from followed characters yet.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                    Follow characters from the suggestions panel, then refresh Noodle.
                  </p>
                </div>
              ) : posts.length === 0 ? (
                <div className="px-8 py-14 text-center">
                  <NoodleLogo className="mx-auto mb-5 h-16 w-24 opacity-95" />
                  <p className="text-base font-bold">The plate is empty.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted-foreground)]">
                    Go to the Settings on the left first, invite characters, pick a generation connection, then refresh.
                  </p>
                </div>
              ) : (
                timelinePosts.map(renderPostArticle)
              )}
            </div>
      </div>
      <Modal
        open={composeOpen}
        onClose={closeComposeModal}
        title="New post"
        width="max-w-[36rem]"
        initialFocusRef={modalComposerRef}
        restoreFocusRef={composerRestoreFocusRef}
        focusScopePortalSelector="[data-noodle-compose-focus-portal='true']"
        panelClassName={cn("marinara-chat-popover", NOODLE_ICON_SCOPE_CLASS)}
        panelStyle={{ "--noodle-blue": NOODLE_BLUE, "--noodle-divider": "var(--marinara-chat-chrome-panel-divider)" } as CSSProperties}
      >
        <div data-component="NoodleView.ModalComposer">
              <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
                {personaAccount ? (
                  <Avatar account={personaAccount} />
                ) : (
                  <AtSign size={28} className="text-[var(--noodle-blue)]" />
                )}
                <div className="min-w-0">
                  <textarea
                    ref={modalComposerRef}
                    defaultValue={composer}
                    onChange={handleComposerChange}
                    onBlur={() => setComposer(composerValueRef.current)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={!personaAccount}
                    placeholder="What's simmering?"
                    aria-autocomplete="list"
                    aria-controls={activeMention ? "noodle-modal-mention-list" : undefined}
                    aria-expanded={Boolean(activeMention)}
                    aria-activedescendant={
                      activeMention && mentionSuggestions.length > 0
                        ? `noodle-modal-mention-list-option-${Math.min(
                            activeMentionIndex,
                            mentionSuggestions.length - 1,
                          )}`
                        : undefined
                    }
                    className="min-h-36 w-full resize-none border-0 bg-transparent py-2 text-[1rem] leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-60"
                  />
                  {renderComposerMentionSuggestions("noodle-modal-mention-list")}
                  {renderDraftPoll()}
                  {attachedImageUrl && (
                    <div className="overflow-hidden rounded-xl border border-[var(--noodle-divider)] bg-[var(--noodle-blue)]/10">
                      <img src={attachedImageUrl} alt="" className="max-h-60 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--noodle-blue)]">
                        <span className="min-w-0 truncate">Attached image</span>
                        <button
                          type="button"
                          onClick={() => setAttachedImageUrl("")}
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[var(--noodle-blue)]/15"
                          title="Remove image"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--noodle-divider)] pt-3 pl-14">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <div ref={modalImageToolRef} className="relative">
                    <NoodleToolButton
                      title="Attach image"
                      active={activeComposerTool === "image"}
                      onClick={() => setActiveComposerTool((current) => (current === "image" ? null : "image"))}
                    >
                      <ImageIcon size={18} />
                    </NoodleToolButton>
                  </div>
                  <div ref={modalPollToolRef} className="relative">
                    <NoodleToolButton
                      title={draftPoll ? "Edit poll" : "Create poll"}
                      active={activeComposerTool === "poll" || Boolean(draftPoll)}
                      onClick={togglePollComposer}
                    >
                      <ListChecks size={18} />
                    </NoodleToolButton>
                  </div>
                  <div ref={modalMediaToolRef} className="relative">
                    <NoodleToolButton
                      title="Emoji, GIFs and stickers"
                      active={activeComposerTool === "media"}
                      onClick={() => setActiveComposerTool((current) => (current === "media" ? null : "media"))}
                    >
                      <Smile size={18} />
                    </NoodleToolButton>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={submitPost}
                  disabled={!canSubmitPost || createPost.isPending}
                  className="h-9 rounded-full bg-[var(--noodle-blue)] px-6 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createPost.isPending ? "Posting..." : "Post"}
                </button>
                {composeOpen &&
                  renderComposerToolPopovers({
                    imageRef: modalImageToolRef,
                    pollRef: modalPollToolRef,
                    mediaRef: modalMediaToolRef,
                  })}
              </div>
        </div>
      </Modal>
      <ExpandedTextarea
        open={noodlePromptEditorOpen}
        onClose={closeNoodlePromptEditor}
        title="Edit Noodle Prompt"
        value={noodlePromptDraft}
        onChange={setNoodlePromptDraft}
        placeholder="Write the base instructions for Noodle timeline generation…"
        closeLabel="Cancel"
        overlayStyle={{ "--noodle-blue": NOODLE_BLUE } as CSSProperties}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void restoreDefaultNoodlePrompt()}
              disabled={
                resetNoodlePrompt.isPending ||
                (!noodlePromptHasOverride && noodlePromptDraft === noodleDefaultPromptText)
              }
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-[var(--noodle-blue)]/35 px-3 text-xs font-semibold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {resetNoodlePrompt.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Restore default
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeNoodlePromptEditor}
                disabled={saveNoodlePrompt.isPending || resetNoodlePrompt.isPending}
                className="min-h-10 flex-1 rounded-md border border-[var(--border)] px-4 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveNoodlePromptDraft()}
                disabled={
                  !noodlePromptDraft.trim() ||
                  !noodlePromptDirty ||
                  saveNoodlePrompt.isPending ||
                  resetNoodlePrompt.isPending
                }
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 [&_svg]:!text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              >
                {saveNoodlePrompt.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save prompt
              </button>
            </div>
          </div>
        }
      />
      {confirmAction && (
        <Modal
          open={Boolean(confirmAction)}
          onClose={() => {
            if (!confirmActionPending) setConfirmAction(null);
          }}
          title={confirmAction.title}
          width="max-w-sm"
          panelClassName={NOODLE_ICON_SCOPE_CLASS}
          panelStyle={{ "--noodle-blue": NOODLE_BLUE } as CSSProperties}
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[var(--foreground)]">{confirmAction.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                disabled={confirmActionPending}
                className="h-9 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] px-4 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmNoodleAction}
                disabled={confirmActionPending}
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded-md px-4 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  confirmAction.kind === "delete-post" ||
                  confirmAction.kind === "delete-reply" ||
                  confirmAction.kind === "reset-timeline"
                    ? "bg-[var(--destructive)] text-[var(--destructive-foreground)] [&_svg]:!text-[var(--destructive-foreground)] hover:opacity-90"
                    : "border border-[var(--noodle-blue)]/45 bg-[var(--noodle-blue)] text-zinc-950 [&_svg]:!text-zinc-950 hover:bg-[var(--noodle-blue)]/85",
                )}
              >
                {confirmActionPending && <Loader2 size={14} className="animate-spin" />}
                {confirmActionPending ? "Working" : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <ImagePromptReviewModal
        open={imagePromptReviewItems.length > 0}
        items={imagePromptReviewItems}
        isSubmitting={confirmNoodleImagePrompts.isPending}
        onCancel={() => setImagePromptReviewItems([])}
        onConfirm={confirmReviewedNoodleImagePrompts}
      />
    </NoodleShell>
  );
}

function NumberSetting({
  label,
  help,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  help?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const draftRef = useRef(String(value));
  const savedValueRef = useRef(value);
  const dirtyRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const boundsRef = useRef({ min, max });

  onCommitRef.current = onCommit;
  boundsRef.current = { min, max };

  useEffect(() => {
    savedValueRef.current = value;
    if (dirtyRef.current) return;
    const nextDraft = String(value);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [value]);

  useEffect(
    () => () => {
      if (!dirtyRef.current) return;
      const parsed = Number(draftRef.current);
      if (!Number.isFinite(parsed)) return;
      const bounds = boundsRef.current;
      const normalized = Math.max(bounds.min, Math.min(bounds.max, Math.round(parsed)));
      if (normalized !== savedValueRef.current) onCommitRef.current(normalized);
    },
    [],
  );

  const commitDraft = (rawDraft: string) => {
    const parsed = Number(rawDraft);
    if (!Number.isFinite(parsed)) {
      const savedDraft = String(savedValueRef.current);
      draftRef.current = savedDraft;
      dirtyRef.current = false;
      setDraft(savedDraft);
      return;
    }
    const normalized = Math.max(min, Math.min(max, Math.round(parsed)));
    const normalizedDraft = String(normalized);
    draftRef.current = normalizedDraft;
    dirtyRef.current = false;
    setDraft(normalizedDraft);
    if (normalized === savedValueRef.current) return;
    savedValueRef.current = normalized;
    onCommitRef.current(normalized);
  };

  return (
    <label className="block space-y-1.5">
      <FieldLabel help={help}>{label}</FieldLabel>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => {
          draftRef.current = event.target.value;
          dirtyRef.current = true;
          setDraft(event.target.value);
        }}
        onBlur={(event) => commitDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className={fieldClass}
      />
    </label>
  );
}
