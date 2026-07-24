import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Eye,
  Link,
  Loader2,
  Lock,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  NOODLE_PRIVATE_POST_CONTENT_MAX_LENGTH,
  NOODLE_PRIVATE_POST_GUIDE_MAX_LENGTH,
  NOODLE_PRIVATE_POST_TITLE_MAX_LENGTH,
} from "@marinara-engine/shared";
import type {
  NoodleIdentityDisclosure,
  NoodleAutoPostingIntensity,
  NoodleAccount,
  NoodleInteraction,
  NoodlePostAccess,
  NoodlerPostView,
  NoodleStageProfileInput,
  NoodlerManagedStageProfile,
  NoodlerManagedPost,
  NoodlerStageProfile,
  Persona,
} from "@marinara-engine/shared";
import {
  useCreateNoodlerPost,
  useCreateNoodlerInteraction,
  useCreateNoodlerStageProfile,
  useDeleteNoodlerPost,
  useDeleteNoodlerStageProfile,
  useGeneratePrivateNoodlePost,
  useGenerateNoodlerStageProfileDraft,
  useNoodle,
  useNoodlerAccounts,
  useNoodlerEligibleAccounts,
  useNoodlerPosts,
  useNoodlerSubscribers,
  useNoodlerViewer,
  useRemoveNoodlerInteraction,
  useToggleNoodlerSubscription,
  useUnlockNoodlerPost,
  useUpdateNoodlerPost,
  useUpdateNoodlerAccess,
  useUpdateNoodlerAutoPosting,
  useRescheduleNoodlerAutoPost,
  useUpdateNoodleSettings,
  useUpdateNoodlerStageProfile,
} from "../../hooks/use-noodle";
import { useActivePersona, usePersonas } from "../../hooks/use-characters";
import { useConnections } from "../../hooks/use-connections";
import { ApiError } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/ui.store";
import { BrowserChrome, formatTime } from "./NoodleBrowserChrome";
import {
  NoodleAnchoredPopover,
  NoodleComposerShell,
  NoodleComposerToolRow,
  NoodlePostCard,
  NoodleToolButton,
  type NoodlePostCardModel,
  useNoodlePostCardController,
} from "./NoodlePostCard";
import { Avatar, NoodleShell, NOODLE_PERSONA_SWITCHER_PAGE_SIZE, NOODLE_PINK, useNoodleAccent } from "./NoodleShell";
import { NoodleProfileSurface } from "./NoodleProfileSurface";
import {
  ConversationMediaPickerPanel,
  type ConversationMediaPickerTabId,
} from "../chat/ConversationMediaPickerPanel";
import { HelpTooltip } from "../ui/HelpTooltip";
import { Modal } from "../ui/Modal";
import type { NoodleNavigationState } from "./noodle-navigation.types";

interface NoodlerHomeProps {
  navigation: Extract<NoodleNavigationState, { mode: "private" | "verification" }>;
  onNavigate: (destination: NoodleNavigationState) => void;
}

interface PrivatePostSubmission {
  profileId: string;
  title: string;
  body: string;
  access: NoodlePostAccess;
  ppvPrice: number | null;
}

interface PrivatePostDraft {
  title: string;
  body: string;
  access: NoodlePostAccess;
  ppvPrice: string;
}

const EMPTY_PRIVATE_POST_DRAFT: PrivatePostDraft = {
  title: "",
  body: "",
  access: "public",
  ppvPrice: "5",
};

function isEmptyPrivatePostDraft(draft: PrivatePostDraft): boolean {
  return (
    draft.title === EMPTY_PRIVATE_POST_DRAFT.title &&
    draft.body === EMPTY_PRIVATE_POST_DRAFT.body &&
    draft.access === EMPTY_PRIVATE_POST_DRAFT.access &&
    draft.ppvPrice === EMPTY_PRIVATE_POST_DRAFT.ppvPrice
  );
}

type NoodlerProfileTab = "posts" | "media" | "subscribers";

function toNoodlePostCardModel(view: NoodlerPostView, profile: NoodlerStageProfile): NoodlePostCardModel {
  return {
    id: view.id,
    authorAccountId: view.authorAccountId,
    title: view.title,
    content: view.content ?? "",
    imageUrl: view.imageUrl,
    imagePrompt: view.imagePrompt,
    metadata: view.metadata ?? {},
    authorSnapshot: {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      avatarCrop: profile.avatarCrop,
    },
    createdAt: view.createdAt,
    interactions: view.interactions,
  };
}

function toManagedPostCardModel(post: NoodlerManagedPost, profile: NoodlerStageProfile): NoodlePostCardModel {
  return {
    id: post.id,
    authorAccountId: post.authorAccountId,
    title: post.title,
    content: post.content,
    imageUrl: post.imageUrl,
    imagePrompt: post.imagePrompt,
    metadata: post.metadata,
    authorSnapshot: {
      id: profile.id,
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      avatarCrop: profile.avatarCrop,
    },
    createdAt: post.createdAt,
    interactions: [],
  };
}

const DISCLOSURE_OPTIONS: Array<{
  value: NoodleIdentityDisclosure;
  label: string;
  shortLabel: string;
  detail: string;
  guidance: string;
}> = [
  {
    value: "open",
    label: "Linked identity",
    shortLabel: "Open",
    detail: "This stage identity can openly be the same person.",
    guidance: "Names, handles, recognizable details, and continuity may carry over.",
  },
  {
    value: "hinted",
    label: "Inspired alter ego",
    shortLabel: "Hinted",
    detail: "Familiar themes can remain, without naming the public identity.",
    guidance: "Exact names and handles are removed, but broad personality and interests may inspire the draft.",
  },
  {
    value: "secret",
    label: "Separate persona",
    shortLabel: "Secret",
    detail: "Create a genuinely separate identity with no public connection.",
    guidance: "The AI receives a reduced, non-identifying inspiration brief and avoids distinctive canonical details.",
  },
];

const EMPTY_STAGE_PROFILE: NoodleStageProfileInput = {
  displayName: "",
  handle: "",
  bio: "",
  stagePersonality: "",
  disclosureMode: "hinted",
};

const fieldClass =
  "mari-chrome-field h-11 w-full rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
const textareaClass =
  "mari-chrome-field min-h-24 w-full resize-y rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
function serializePrivatePostGuide(title: string, body: string) {
  const sections: string[] = [];
  if (title.trim()) sections.push(`Title:\n${title.trim()}`);
  if (body.trim()) sections.push(`Body:\n${body.trim()}`);
  return sections.join("\n\n");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function NoodlerHome({ navigation, onNavigate }: NoodlerHomeProps) {
  const { data, isError, refetch } = useNoodle();
  const updateSettings = useUpdateNoodleSettings();
  const enabled = data?.settings.enableNoodler === true;
  const accountsQuery = useNoodlerAccounts(navigation.mode === "private" && enabled);
  const personasQuery = usePersonas(navigation.mode === "private" && enabled);
  const activePersonaQuery = useActivePersona(navigation.mode === "private" && enabled);
  const storedPersonaId = useUIStore((state) => state.noodleSelectedPersonaId);
  const setStoredPersonaId = useUIStore((state) => state.setNoodleSelectedPersonaId);
  const personas = (personasQuery.data ?? []) as Persona[];
  const viewerPersonaId =
    (storedPersonaId && personas.some((persona) => persona.id === storedPersonaId) ? storedPersonaId : null) ??
    activePersonaQuery.data?.id ??
    personas[0]?.id ??
    null;
  const viewerAccounts = (data?.accounts ?? []).filter((account) => account.kind === "persona");
  const shellPersonaAccount = viewerAccounts.find((account) => account.entityId === viewerPersonaId) ?? null;
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileAccountSwitcherOpen, setMobileAccountSwitcherOpen] = useState(false);
  const [personaAccountLimit, setPersonaAccountLimit] = useState(NOODLE_PERSONA_SWITCHER_PAGE_SIZE);
  const accountSwitcherRef = useRef<HTMLDivElement | null>(null);
  const visiblePersonaAccounts = viewerAccounts.slice(0, personaAccountLimit);
  const switchViewerPersona = (account: NoodleAccount, mobile: boolean) => {
    // A reply/edit composed as the previous persona must not carry over and submit as the
    // newly-selected one, so discard in-flight composer, tool, and post-menu state first.
    postCardController.reset();
    setStoredPersonaId(account.entityId);
    if (mobile) setMobileDrawerOpen(false);
    else setAccountSwitcherOpen(false);
  };
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
  const [privatePostDrafts, setPrivatePostDrafts] = useState<Record<string, PrivatePostDraft>>({});
  const updatePrivatePostDraft = (profileId: string, patch: Partial<PrivatePostDraft>) => {
    setPrivatePostDrafts((current) => {
      const nextDraft = {
        ...EMPTY_PRIVATE_POST_DRAFT,
        ...current[profileId],
        ...patch,
      };
      if (!isEmptyPrivatePostDraft(nextDraft)) {
        return { ...current, [profileId]: nextDraft };
      }
      if (!current[profileId]) return current;
      const next = { ...current };
      delete next[profileId];
      return next;
    });
  };
  const clearPrivatePostDraft = (profileId: string) => {
    setPrivatePostDrafts((current) => {
      if (!current[profileId]) return current;
      const next = { ...current };
      delete next[profileId];
      return next;
    });
  };
  const confirmDiscardPrivatePostDrafts = () =>
    Object.keys(privatePostDrafts).length === 0 ||
    window.confirm("Discard unpublished NoodleR post drafts?");
  const exitToPublic = () => {
    if (!confirmDiscardPrivatePostDrafts()) return;
    setPrivatePostDrafts({});
    onNavigate({ mode: "public", view: "home" });
  };
  const openSettings = () => {
    if (!confirmDiscardPrivatePostDrafts()) return;
    setPrivatePostDrafts({});
    onNavigate({ mode: "settings" });
  };
  const [feedSearch, setFeedSearch] = useState("");
  const [feedTab, setFeedTab] = useState<"all" | "subscribed">("all");
  const viewerQuery = useNoodlerViewer(viewerPersonaId, enabled);
  const toggleSubscription = useToggleNoodlerSubscription();
  const unlockPost = useUnlockNoodlerPost();
  const createInteraction = useCreateNoodlerInteraction();
  const removeInteraction = useRemoveNoodlerInteraction();
  // NoodleR is a roleplay sandbox — the user owns every stage profile, so they
  // can edit/delete creator posts just like their own Noodle timeline. NoodleR
  // posts are private, so these route through the private-only endpoints; the
  // viewer feed is refetched on success.
  const updatePost = useUpdateNoodlerPost();
  const deletePost = useDeleteNoodlerPost();
  const updateAccess = useUpdateNoodlerAccess();
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceKind, setSourceKind] = useState<"all" | "character" | "persona">("all");
  const eligibleAccountsQuery = useNoodlerEligibleAccounts(
    sourceSearch,
    sourceKind,
    navigation.mode === "private" && enabled,
  );
  const createProfile = useCreateNoodlerStageProfile();
  const deleteProfile = useDeleteNoodlerStageProfile();
  const updateProfile = useUpdateNoodlerStageProfile();
  const generatePost = useGeneratePrivateNoodlePost();
  const createPost = useCreateNoodlerPost();
  const generateProfileDraft = useGenerateNoodlerStageProfileDraft();
  const connectionsQuery = useConnections();
  const connections = (connectionsQuery.data ?? []) as Array<{ id: string; name: string; model?: string }>;
  const [profileDraft, setProfileDraft] = useState<NoodleStageProfileInput | null>(null);
  const [draftPublicAccountId, setDraftPublicAccountId] = useState<string | null>(null);
  const [creationStep, setCreationStep] = useState<"source" | "disclosure" | "draft" | null>(null);
  const [creationDisclosure, setCreationDisclosure] = useState<NoodleIdentityDisclosure>("hinted");
  const [draftGuidance, setDraftGuidance] = useState("");
  const [draftConnectionId, setDraftConnectionId] = useState("");
  const [previousDraft, setPreviousDraft] = useState<NoodleStageProfileInput | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (
      navigation.mode !== "private" ||
      navigation.view !== "profile" ||
      !accountsQuery.isSuccess ||
      accountsQuery.data.some((profile) => profile.id === navigation.accountId)
    ) {
      return;
    }
    onNavigate({ mode: "private", view: "profiles" });
  }, [accountsQuery.data, accountsQuery.isSuccess, navigation, onNavigate]);
  useEffect(() => {
    if (navigation.mode !== "private" || navigation.view !== "create-profile") return;
    setEditingProfileId(null);
    setDraftPublicAccountId(navigation.publicAccountId);
    setProfileDraft(null);
    setCreationStep("disclosure");
    setCreationDisclosure("hinted");
    setDraftGuidance("");
    setDraftConnectionId("");
    setPreviousDraft(null);
  }, [navigation]);
  // Returns false (and blocks navigation) when there is an unsaved create/edit draft the
  // user chose to keep. Covers both new drafts and changed edits so no surface silently
  // discards work.
  const confirmDiscardProfileDraft = (): boolean => {
    if (!profileDraft) return true;
    const editing = editingProfileId
      ? accountsQuery.data?.find((profile) => profile.id === editingProfileId) ?? null
      : null;
    if (editing) {
      const savedDraft: NoodleStageProfileInput = {
        displayName: editing.displayName,
        handle: editing.handle,
        bio: editing.bio,
        stagePersonality: editing.stagePersonality,
        disclosureMode: editing.disclosureMode ?? "hinted",
      };
      if (JSON.stringify(profileDraft) === JSON.stringify(savedDraft)) return true;
    }
    return window.confirm("Discard unsaved profile changes?");
  };
  const goToHub = () => {
    if (!confirmDiscardProfileDraft()) return;
    setCreationStep(null);
    setProfileDraft(null);
    setEditingProfileId(null);
    if (enabled) {
      onNavigate({ mode: "private", view: "hub" });
      setMobileDrawerOpen(false);
    }
  };
  const reactToPost = (post: NoodlePostCardModel, type: "like" | "repost", active = false) => {
    if (!viewerPersonaId) return;
    const onError = (error: unknown) =>
      toast.error(errorMessage(error, active ? "Could not undo that reaction." : "Could not react to this post."));
    if (active) removeInteraction.mutate({ postId: post.id, personaId: viewerPersonaId, type }, { onError });
    else createInteraction.mutate({ postId: post.id, personaId: viewerPersonaId, type }, { onError });
  };
  const reactToReply = (post: NoodlePostCardModel, reply: NoodleInteraction, active: boolean) => {
    if (!viewerPersonaId) return;
    const payload = { postId: post.id, personaId: viewerPersonaId, type: "like" as const, parentInteractionId: reply.id };
    const onError = (error: unknown) => toast.error(errorMessage(error, "Could not react to this reply."));
    if (active) removeInteraction.mutate(payload, { onError });
    else createInteraction.mutate(payload, { onError });
  };
  const submitReply = async (
    post: NoodlePostCardModel,
    input: { content: string; parentInteractionId: string | null },
  ) => {
    if (!viewerPersonaId) return;
    await createInteraction.mutateAsync(
      {
        postId: post.id,
        personaId: viewerPersonaId,
        type: "reply",
        content: input.content,
        ...(input.parentInteractionId ? { parentInteractionId: input.parentInteractionId } : {}),
      },
      {
        onError: (error) => toast.error(errorMessage(error, "Could not post this reply.")),
      },
    );
  };
  const savePost = async (post: NoodlePostCardModel, input: { title: string | null; content: string }) => {
    await updatePost.mutateAsync(
      { id: post.id, accountId: post.authorAccountId, title: input.title, content: input.content },
      {
        onError: (error) => toast.error(errorMessage(error, "Could not update this post.")),
      },
    );
  };
  const deleteNoodlePost = (post: NoodlePostCardModel) => {
    if (!window.confirm("Delete this NoodleR post along with its likes, reposts, and replies?")) return;
    deletePost.mutate({ id: post.id, accountId: post.authorAccountId }, {
      onError: (error) => toast.error(errorMessage(error, "Could not delete this post.")),
    });
  };
  const postCardController = useNoodlePostCardController({
    postManagement: true,
    personaAccount: shellPersonaAccount,
    savePost,
    deletePost: deleteNoodlePost,
    reactToPost,
    reactToReply,
    submitReply,
    reactionPendingFor: () => false,
    createInteractionPendingFor: (_postId, type) => type === "reply" && createInteraction.isPending,
    updatePostPending: updatePost.isPending,
    titleMaxLength: NOODLE_PRIVATE_POST_TITLE_MAX_LENGTH,
    openAuthorProfile: (accountId) => onNavigate({ mode: "private", view: "profile", accountId }),
  });
  const postCardCtx = postCardController.ctx;
  const selectedProfile =
    navigation.mode === "private" && navigation.view === "profile"
      ? accountsQuery.data?.find((profile) => profile.id === navigation.accountId) ?? null
      : null;
  const postsQuery = useNoodlerPosts(selectedProfile?.id ?? null);
  const selectedViewerCreator =
    viewerQuery.data?.creators.find((creator) => creator.profile.id === selectedProfile?.id) ?? null;
  const eligiblePublicAccounts = eligibleAccountsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const selectedSource =
    eligiblePublicAccounts.find((account) => account.id === draftPublicAccountId) ??
    data?.accounts.find((account) => account.id === draftPublicAccountId) ??
    null;
  const sourcePickerLoading = eligibleAccountsQuery.isLoading || eligibleAccountsQuery.isFetching;

  const handleSourceSearch = (value: string) => {
    setSourceSearch(value);
    setDraftPublicAccountId(null);
  };
  const handleSourceKind = (value: "all" | "character" | "persona") => {
    setSourceKind(value);
    setDraftPublicAccountId(null);
  };

  const enableNoodler = () => {
    updateSettings.mutate(
      { enableNoodler: true },
      {
        onSuccess: () => onNavigate({ mode: "private", view: "hub" }),
        onError: (error) => toast.error(errorMessage(error, "Could not enable NoodleR.")),
      },
    );
  };

  const beginCreate = () => {
    setEditingProfileId(null);
    setDraftPublicAccountId(null);
    setProfileDraft(null);
    setCreationStep("source");
    setCreationDisclosure("hinted");
    setDraftGuidance("");
    setDraftConnectionId("");
    setPreviousDraft(null);
    setSourceSearch("");
    setSourceKind("all");
  };

  const cancelCreateProfile = () => {
    if (!confirmDiscardProfileDraft()) return;
    const publicAccountId =
      navigation.mode === "private" && navigation.view === "create-profile"
        ? navigation.publicAccountId
        : draftPublicAccountId;
    setCreationStep(null);
    setProfileDraft(null);
    setDraftPublicAccountId(null);
    setPreviousDraft(null);
    if (publicAccountId && navigation.mode === "private" && navigation.view === "create-profile") {
      onNavigate({ mode: "public", view: "profile", accountId: publicAccountId, connection: null });
    }
  };

  const beginEdit = (profile: NoodlerStageProfile) => {
    setEditingProfileId(profile.id);
    setDraftPublicAccountId(profile.publicAccountId);
    setCreationDisclosure(profile.disclosureMode ?? "hinted");
    setCreationStep("draft");
    setDraftGuidance("");
    setDraftConnectionId("");
    setPreviousDraft(null);
    setProfileDraft({
      displayName: profile.displayName,
      handle: profile.handle,
      bio: profile.bio,
      stagePersonality: profile.stagePersonality,
      disclosureMode: profile.disclosureMode ?? "hinted",
    });
  };

  const closeProfileEditor = () => {
    if (!confirmDiscardProfileDraft()) return;
    setProfileDraft(null);
    setPreviousDraft(null);
    setEditingProfileId(null);
    setCreationStep(null);
  };

  const changeDisclosure = (value: NoodleIdentityDisclosure) => {
    setCreationDisclosure(value);
    setProfileDraft((current) => (current ? { ...current, disclosureMode: value } : current));
  };

  const generateDraft = () => {
    if (!draftPublicAccountId && !editingProfileId) return;
    if (connections.length === 0) {
      toast.error("No connections configured. Add one in Settings → Connections.");
      return;
    }
    generateProfileDraft.mutate(
      {
        ...(editingProfileId ? { privateAccountId: editingProfileId } : { publicAccountId: draftPublicAccountId! }),
        disclosureMode: creationDisclosure,
        guidance: draftGuidance,
        currentDraft: profileDraft ?? undefined,
        connectionId: draftConnectionId || undefined,
      },
      {
        onSuccess: (draft) => {
          if (profileDraft) setPreviousDraft(profileDraft);
          setProfileDraft(draft);
          setCreationStep("draft");
        },
        onError: (error) => toast.error(errorMessage(error, "Could not generate a stage profile draft.")),
      },
    );
  };

  const saveProfile = () => {
    if (!profileDraft) return;
    const input = {
      ...profileDraft,
      handle: profileDraft.handle.replace(/^@+/u, ""),
    };
    const onSuccess = (profile: NoodlerStageProfile) => {
      setProfileDraft(null);
      setEditingProfileId(null);
      setDraftPublicAccountId(null);
      setCreationStep(null);
      setPreviousDraft(null);
      onNavigate({ mode: "private", view: "profile", accountId: profile.id });
      toast.success(editingProfileId ? "Stage profile updated." : "Stage profile created.");
    };
    const onError = async (error: unknown) => {
      if (!editingProfileId && draftPublicAccountId && error instanceof ApiError && error.status === 409) {
        const refreshed = await accountsQuery.refetch();
        const existing = refreshed.data?.find((profile) => profile.publicAccountId === draftPublicAccountId);
        if (existing) {
          setProfileDraft(null);
          setCreationStep(null);
          onNavigate({ mode: "private", view: "profile", accountId: existing.id });
          toast.info("That stage profile already existed, so it was opened instead.");
          return;
        }
      }
      toast.error(errorMessage(error, "Could not save the stage profile."));
    };
    if (editingProfileId) {
      updateProfile.mutate({ accountId: editingProfileId, ...input }, { onSuccess, onError });
    } else if (draftPublicAccountId) {
      createProfile.mutate({ publicAccountId: draftPublicAccountId, stageProfile: input }, { onSuccess, onError });
    }
  };

  const submitManualPost = async ({ profileId, title, body, access, ppvPrice }: PrivatePostSubmission) => {
    await createPost.mutateAsync({
      targetAccountId: profileId,
      title,
      content: body,
      access,
      ...(access === "ppv" ? { ppvPrice } : {}),
    });
    toast.success("Private post published.");
  };

  const submitGuidedPost = async ({ profileId, title, body, access, ppvPrice }: PrivatePostSubmission) => {
    const guide = serializePrivatePostGuide(title, body);
    await generatePost.mutateAsync({
      mode: "private",
      targetAccountId: profileId,
      ...(guide ? { privatePostGuide: guide } : {}),
      access,
      ...(access === "ppv" ? { ppvPrice } : {}),
    });
    toast.success("Private post generated.");
  };

  const toggleCreatorSubscription = (creatorAccountId: string, subscribed: boolean) => {
    if (!viewerPersonaId) return;
    toggleSubscription.mutate(
      { creatorAccountId, personaId: viewerPersonaId, subscribed },
      { onError: (error) => toast.error(errorMessage(error, "Could not update your subscription.")) },
    );
  };

  const mainAuthorProfile = shellPersonaAccount
    ? accountsQuery.data?.find((profile) => profile.publicAccountId === shellPersonaAccount.id) ?? null
    : null;

  const shellProps = {
    appMode: "noodler" as const,
    activeView:
      navigation.mode === "private" && navigation.view === "profile"
        ? "profile" as const
        : "noodler" as const,
    homeActive: navigation.mode === "private" && navigation.view === "hub",
    accent: NOODLE_PINK,
    enableNoodler: enabled,
    personaAccount: shellPersonaAccount,
    sortedPersonaAccounts: viewerAccounts,
    visiblePersonaAccounts,
    linkedPublicAccountIds: new Set((accountsQuery.data ?? []).flatMap((profile) => profile.publicAccountId ?? [])),
    onLoadMorePersonaAccounts: () =>
      setPersonaAccountLimit((current) => current + NOODLE_PERSONA_SWITCHER_PAGE_SIZE),
    onSwitchPersona: switchViewerPersona,
    accountSwitcherOpen,
    onAccountSwitcherOpenChange: setAccountSwitcherOpen,
    accountSwitcherRef,
    mobileDrawerOpen,
    onMobileDrawerOpenChange: setMobileDrawerOpen,
    mobileAccountSwitcherOpen,
    onMobileAccountSwitcherOpenChange: setMobileAccountSwitcherOpen,
    notificationCount: 0,
    onOpenHome: exitToPublic,
    onOpenMobileHome: exitToPublic,
    onOpenNoodler: goToHub,
    onOpenProfile: mainAuthorProfile
      ? () => onNavigate({ mode: "private", view: "profile", accountId: mainAuthorProfile.id })
      : undefined,
    onOpenSettings: openSettings,
    overlays: (
      <BrowserChrome
        badgeLabel="Private"
        url="https://noodler.local"
        mobileUrl="noodle.marinara.local/noodler"
      />
    ),
  } as const;

  // Reserve the same rail width as the feed view (see NoodleHome's "settings" rail) so
  // non-feed screens don't stretch the shell wider and look like a different layout.
  const emptyRightRail = <aside className="hidden w-[22rem] shrink-0 px-4 py-3 xl:block" aria-hidden="true" />;

  if (!data && !isError) {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
        <NoodlerFrame onBack={exitToPublic} title="NoodleR">
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[var(--noodle-blue)]" />
          </div>
        </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (!data && isError) {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
        <NoodlerFrame onBack={exitToPublic} title="NoodleR">
          <EmptyState title="NoodleR could not be loaded." action="Try again" onAction={() => void refetch()} />
        </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (navigation.mode === "verification" || (data && !enabled)) {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
      <NoodlerFrame onBack={exitToPublic} title="About NoodleR">
        <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--noodle-blue)]/15 text-[var(--noodle-blue)]">
            <Lock size={28} />
          </span>
          <h2 className="mt-5 text-2xl font-black">NoodleR is an optional private space.</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
            NoodleR is intended for adults. Private creator accounts stay isolated from the public Noodle timeline.
            Enable access only if you are 18 or older and want to create stage profiles.
          </p>
          <button
            type="button"
            onClick={enableNoodler}
            disabled={!data?.settings || updateSettings.isPending}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--noodle-blue)] px-6 text-sm font-bold text-zinc-950 [&_svg]:!text-zinc-950 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateSettings.isPending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
            {updateSettings.isPending ? "Enabling..." : "I am 18+ and want to enable NoodleR"}
          </button>
        </div>
      </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (creationStep === "source") {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
      <NoodlerFrame onBack={() => setCreationStep(null)} title="Create stage profile" hideBack>
        <StageProfileSourcePicker
          accounts={eligiblePublicAccounts}
          search={sourceSearch}
          kind={sourceKind}
          selectedId={draftPublicAccountId}
          onSearch={handleSourceSearch}
          onKindChange={handleSourceKind}
          onSelect={setDraftPublicAccountId}
          hasMore={Boolean(eligibleAccountsQuery.hasNextPage)}
          isLoadingMore={eligibleAccountsQuery.isFetchingNextPage}
          isLoading={eligibleAccountsQuery.isLoading}
          isError={eligibleAccountsQuery.isError}
          onRetry={() => void eligibleAccountsQuery.refetch()}
          onLoadMore={() => void eligibleAccountsQuery.fetchNextPage()}
          onBack={cancelCreateProfile}
          onContinue={() => setCreationStep("disclosure")}
        />
      </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (creationStep === "disclosure") {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
      <NoodlerFrame onBack={cancelCreateProfile} title="Set identity disclosure" hideBack>
        <DisclosureStep
          source={selectedSource}
          value={creationDisclosure}
          onChange={setCreationDisclosure}
          onBack={
            navigation.mode === "private" && navigation.view === "create-profile"
              ? cancelCreateProfile
              : () => setCreationStep("source")
          }
          onContinue={() => setCreationStep("draft")}
        />
      </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (profileDraft || creationStep === "draft") {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
      <NoodlerFrame
        onBack={editingProfileId ? closeProfileEditor : () => setCreationStep("disclosure")}
        title={editingProfileId ? "Edit stage profile" : "Create stage profile"}
        hideBack={!editingProfileId}
      >
        <StageProfileForm
          draft={profileDraft ?? { ...EMPTY_STAGE_PROFILE, disclosureMode: creationDisclosure }}
          source={selectedSource}
          disclosureMode={creationDisclosure}
          onDisclosureChange={changeDisclosure}
          guidance={draftGuidance}
          onGuidanceChange={setDraftGuidance}
          connections={connections}
          connectionId={draftConnectionId}
          onConnectionChange={setDraftConnectionId}
          onGenerate={generateDraft}
          isGenerating={generateProfileDraft.isPending}
          previousDraft={previousDraft}
          onUndoDraft={() => {
            if (!previousDraft) return;
            setProfileDraft(previousDraft);
            setPreviousDraft(null);
          }}
          onChange={(patch) =>
            setProfileDraft((current) => ({
              ...(current ?? { ...EMPTY_STAGE_PROFILE, disclosureMode: creationDisclosure }),
              ...patch,
            }))
          }
          publicAccountId={draftPublicAccountId}
          isEditing={Boolean(editingProfileId)}
          isPending={createProfile.isPending || updateProfile.isPending}
          onCancel={editingProfileId ? closeProfileEditor : cancelCreateProfile}
          onSave={saveProfile}
        />
      </NoodlerFrame>
      </NoodleShell>
    );
  }

  if (selectedProfile) {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
      <main className="h-full min-h-0 overflow-y-auto">
        <StageProfileView
          key={`${selectedProfile.id}:${shellPersonaAccount?.id ?? "no-viewer"}`}
          profile={selectedProfile}
          posts={postsQuery.data ?? []}
          viewerCreator={selectedViewerCreator}
          viewerAccount={shellPersonaAccount}
          postCardCtx={postCardCtx}
          viewerAccounts={viewerAccounts}
          viewerIsLoading={Boolean(viewerPersonaId) && !viewerQuery.data && viewerQuery.isLoading}
          viewerIsError={Boolean(viewerPersonaId) && !viewerQuery.data && viewerQuery.isError}
          onRetryViewer={() => void viewerQuery.refetch()}
          draft={privatePostDrafts[selectedProfile.id] ?? EMPTY_PRIVATE_POST_DRAFT}
          onDraftChange={(patch) => updatePrivatePostDraft(selectedProfile.id, patch)}
          onClearDraft={() => clearPrivatePostDraft(selectedProfile.id)}
          isLoading={postsQuery.isLoading}
          isError={postsQuery.isError}
          onRetry={() => void postsQuery.refetch()}
          onEdit={() => beginEdit(selectedProfile)}
          onDelete={() => {
            if (!window.confirm(`Delete ${selectedProfile.displayName} and all of this NoodleR profile's posts?`)) {
              return;
            }
            deleteProfile.mutate(selectedProfile.id, {
              onSuccess: () => {
                clearPrivatePostDraft(selectedProfile.id);
                onNavigate({ mode: "private", view: "profiles" });
                toast.success("Stage profile deleted.");
              },
              onError: (error) => toast.error(errorMessage(error, "Could not delete the stage profile.")),
            });
          }}
          onManualPost={submitManualPost}
          onGuidedPost={submitGuidedPost}
          manualPending={createPost.isPending}
          guidePending={generatePost.isPending}
          onUnlock={(postId) => {
            if (!viewerPersonaId) return;
            unlockPost.mutate(
              { postId, personaId: viewerPersonaId },
              { onError: (error) => toast.error(errorMessage(error, "Could not unlock this post.")) },
            );
          }}
          unlockPending={unlockPost.isPending}
          onToggleSubscription={toggleCreatorSubscription}
          subscriptionPending={toggleSubscription.isPending}
          accessPending={updateAccess.isPending}
          deletePending={deleteProfile.isPending}
          onAccessChange={(access) =>
            updateAccess.mutate(
              { accountId: selectedProfile.id, ...access },
              {
                onSuccess: () => toast.success("Access settings updated."),
                onError: (error) => toast.error(errorMessage(error, "Could not update access settings.")),
              },
            )
          }
        />
      </main>
      </NoodleShell>
    );
  }

  // Creator discovery stays in the wide-screen rail. Narrow layouts omit it so the
  // timeline remains the primary surface instead of stacking sidebar content above it.
  const feedRightRail = (
    <aside className="hidden w-[22rem] shrink-0 px-4 py-3 xl:block">
      <div className="sticky top-3 space-y-4">
        <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--noodle-divider)] bg-[var(--background)] px-4 text-sm transition-colors focus-within:border-[var(--noodle-blue)]">
          <Search size={17} className="shrink-0 text-[var(--noodle-blue)]" />
          <input
            value={feedSearch}
            onChange={(event) => setFeedSearch(event.target.value)}
            placeholder="Search posts or @creators"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
          />
          {feedSearch.trim() && (
            <button
              type="button"
              onClick={() => setFeedSearch("")}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <SubscriptionSections
          creators={(viewerQuery.data?.creators ?? []).filter(
            (creator) => creator.profile.id !== mainAuthorProfile?.id,
          )}
          onToggleSubscription={toggleCreatorSubscription}
          togglePending={toggleSubscription.isPending}
        />
      </div>
    </aside>
  );

  if (navigation.mode === "private" && navigation.view === "profiles") {
    return (
      <NoodleShell {...shellProps} rightRail={emptyRightRail}>
        <div className="flex h-full min-h-0 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-14 items-center gap-3 border-b border-[var(--noodle-divider)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Stage profiles</p>
              <p className="text-xs text-[var(--muted-foreground)]">Private identities and guided posts</p>
            </div>
            <button
              type="button"
              onClick={beginCreate}
              disabled={sourcePickerLoading || eligibleAccountsQuery.isError || eligiblePublicAccounts.length === 0}
              title={
                sourcePickerLoading
                  ? "Loading eligible sources"
                  : eligibleAccountsQuery.isError
                    ? "Sources unavailable"
                    : eligiblePublicAccounts.length === 0
                      ? "Every eligible account already has a stage profile"
                      : undefined
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--noodle-blue)] px-3 text-xs font-bold text-zinc-950 [&_svg]:!text-zinc-950 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} />
              New profile
            </button>
          </div>
          {accountsQuery.isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={24} className="animate-spin text-[var(--noodle-blue)]" />
            </div>
          ) : accountsQuery.isError ? (
            <EmptyState
              title="Stage profiles could not be loaded."
              action="Try again"
              onAction={() => void accountsQuery.refetch()}
            />
          ) : accountsQuery.data && accountsQuery.data.length > 0 ? (
            <div className="divide-y divide-[var(--noodle-divider)]">
              {accountsQuery.data.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => onNavigate({ mode: "private", view: "profile", accountId: profile.id })}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--noodle-blue)]"
                >
                  <ProfileInitial profile={profile} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-bold">{profile.displayName}</h3>
                      <DisclosureBadge mode={profile.disclosureMode} />
                    </div>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">
                      {profile.disclosureMode ? `@${profile.handle}` : "Complete this legacy stage profile"}
                    </p>
                  </div>
                  <ChevronRight size={17} className="shrink-0 text-[var(--muted-foreground)]" />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No stage profiles yet."
              detail="Create a separate private identity for an eligible persona or character."
              action={eligiblePublicAccounts.length > 0 ? "Create stage profile" : undefined}
              onAction={eligiblePublicAccounts.length > 0 ? beginCreate : undefined}
            />
          )}
          </main>
        </div>
      </NoodleShell>
    );
  }

  return (
    <NoodleShell {...shellProps} rightRail={feedRightRail}>
      <ViewerHub
        personas={personas}
        scope={viewerQuery.data}
        isLoading={viewerQuery.isLoading}
        isError={viewerQuery.isError}
        onRetry={() => void viewerQuery.refetch()}
        onRefresh={() => void viewerQuery.refetch()}
        isRefreshing={viewerQuery.isFetching}
        unlockPending={unlockPost.isPending}
        postCardCtx={postCardCtx}
        onUnlock={(postId) => {
          if (!viewerPersonaId) return;
          unlockPost.mutate(
            { postId, personaId: viewerPersonaId },
            { onError: (error) => toast.error(errorMessage(error, "Could not unlock this post.")) },
          );
        }}
        search={feedSearch}
        tab={feedTab}
        onTabChange={setFeedTab}
        authorProfile={accountsQuery.isSuccess ? mainAuthorProfile : null}
        authorDraft={
          mainAuthorProfile
            ? privatePostDrafts[mainAuthorProfile.id] ?? EMPTY_PRIVATE_POST_DRAFT
            : EMPTY_PRIVATE_POST_DRAFT
        }
        onAuthorDraftChange={(patch) => {
          if (mainAuthorProfile) updatePrivatePostDraft(mainAuthorProfile.id, patch);
        }}
        onClearAuthorDraft={() => {
          if (mainAuthorProfile) clearPrivatePostDraft(mainAuthorProfile.id);
        }}
        authorLoading={accountsQuery.isLoading || !data}
        authorError={accountsQuery.isError && !accountsQuery.data}
        onRetryAuthor={() => void accountsQuery.refetch()}
        onCreateAuthorProfile={
          shellPersonaAccount
            ? () =>
                onNavigate({
                  mode: "private",
                  view: "create-profile",
                  publicAccountId: shellPersonaAccount.id,
                })
            : undefined
        }
        onOpenAuthorProfile={
          mainAuthorProfile
            ? () => onNavigate({ mode: "private", view: "profile", accountId: mainAuthorProfile.id })
            : undefined
        }
        onManualPost={submitManualPost}
        onGuidedPost={submitGuidedPost}
        manualPending={createPost.isPending}
        guidePending={generatePost.isPending}
        onToggleSubscription={toggleCreatorSubscription}
        togglePending={toggleSubscription.isPending}
      />
    </NoodleShell>
  );
}

function StageProfileForm({
  draft,
  source,
  disclosureMode,
  onDisclosureChange,
  guidance,
  onGuidanceChange,
  connections,
  connectionId,
  onConnectionChange,
  onGenerate,
  isGenerating,
  previousDraft,
  onUndoDraft,
  onChange,
  publicAccountId,
  isEditing,
  isPending,
  onCancel,
  onSave,
}: {
  draft: NoodleStageProfileInput;
  source: { displayName: string; handle: string } | null;
  disclosureMode: NoodleIdentityDisclosure;
  onDisclosureChange: (value: NoodleIdentityDisclosure) => void;
  guidance: string;
  onGuidanceChange: (value: string) => void;
  connections: Array<{ id: string; name: string; model?: string }>;
  connectionId: string;
  onConnectionChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  previousDraft: NoodleStageProfileInput | null;
  onUndoDraft: () => void;
  onChange: (patch: Partial<NoodleStageProfileInput>) => void;
  publicAccountId: string | null;
  isEditing: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [connectionPickerOpen, setConnectionPickerOpen] = useState(false);
  const [relationshipPickerOpen, setRelationshipPickerOpen] = useState(false);
  const [relationshipPickerPosition, setRelationshipPickerPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const connectionPickerRef = useRef<HTMLDivElement>(null);
  const relationshipPickerRef = useRef<HTMLDivElement>(null);
  const relationshipPickerMenuRef = useRef<HTMLDivElement>(null);
  const canSave =
    Boolean((isEditing || publicAccountId) && draft.displayName.trim() && draft.handle.trim()) &&
    !isPending &&
    !isGenerating;
  const selectedConnection = connections.find((connection) => connection.id === connectionId) ?? null;
  const selectedDisclosure =
    DISCLOSURE_OPTIONS.find((option) => option.value === disclosureMode) ?? DISCLOSURE_OPTIONS[0];

  useEffect(() => {
    if (!connectionPickerOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!connectionPickerRef.current?.contains(event.target as Node)) {
        setConnectionPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [connectionPickerOpen]);

  useEffect(() => {
    if (!relationshipPickerOpen) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      if (
        !relationshipPickerRef.current?.contains(event.target as Node) &&
        !relationshipPickerMenuRef.current?.contains(event.target as Node)
      ) {
        setRelationshipPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [relationshipPickerOpen]);

  useEffect(() => {
    if (!relationshipPickerOpen || !relationshipPickerRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const anchor = relationshipPickerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const menuWidth = relationshipPickerMenuRef.current?.offsetWidth ?? 288;
      const menuHeight = relationshipPickerMenuRef.current?.offsetHeight ?? 224;
      const left = Math.min(Math.max(8, anchor.left), window.innerWidth - menuWidth - 8);
      const roomBelow = window.innerHeight - anchor.bottom;
      const top =
        roomBelow >= menuHeight + 8
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - menuHeight - 4);
      setRelationshipPickerPosition({ left, top });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [relationshipPickerOpen]);

  const relationshipPickerMenu =
    relationshipPickerOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={relationshipPickerMenuRef}
            role="listbox"
            aria-label="Identity relationship"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setRelationshipPickerOpen(false);
                relationshipPickerRef.current?.querySelector("button")?.focus();
              }
            }}
            className="fixed z-[9999] w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-foreground/10 bg-[var(--card)] p-1 shadow-2xl"
            style={
              relationshipPickerPosition
                ? { left: relationshipPickerPosition.left, top: relationshipPickerPosition.top }
                : { visibility: "hidden" }
            }
          >
            {DISCLOSURE_OPTIONS.map((option) => {
              const isSelected = option.value === disclosureMode;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onDisclosureChange(option.value);
                    setRelationshipPickerOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/10",
                    isSelected && "bg-foreground/5",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[var(--foreground)]">{option.label}</span>
                    <span className="mt-0.5 block text-[0.6875rem] leading-4 text-[var(--muted-foreground)]">
                      {option.detail}
                    </span>
                  </span>
                  {isSelected && <Check size={14} className="mt-0.5 shrink-0 text-[var(--noodle-blue)]" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col">
      <div className="px-4 py-5 sm:px-6 lg:py-6">
        <div className="rounded-lg border border-[var(--noodle-divider)] bg-[var(--accent)]/40 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--noodle-blue)]/15 text-[var(--noodle-blue)]">
              <Sparkles size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {isEditing ? "Refine this stage identity" : "Create the stage identity"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-5 text-[var(--muted-foreground)]">
                <span>
                  {source
                    ? `Built from ${source.displayName} (@${source.handle}).`
                    : "Your source identity is kept separate from this stage profile."}
                </span>
                <span>Relationship:</span>
                <div ref={relationshipPickerRef} className="relative">
                  <button
                    type="button"
                    disabled={isGenerating || isPending}
                    onClick={() => setRelationshipPickerOpen((open) => !open)}
                    aria-haspopup="listbox"
                    aria-expanded={relationshipPickerOpen}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-bold text-[var(--foreground)] transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selectedDisclosure.label}
                    <ChevronDown
                      size={13}
                      className={cn("transition-transform", relationshipPickerOpen && "rotate-180")}
                    />
                  </button>
                  {relationshipPickerMenu}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold">Stage name</span>
                <input
                  required
                  aria-required="true"
                  disabled={isGenerating || isPending}
                  value={draft.displayName}
                  maxLength={120}
                  onChange={(event) => onChange({ displayName: event.target.value })}
                  className={`${fieldClass} !h-10`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold">Stage handle</span>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-[var(--noodle-blue)]"
                  >
                    @
                  </span>
                  <input
                    required
                    aria-required="true"
                    disabled={isGenerating || isPending}
                    value={draft.handle}
                    maxLength={40}
                    onChange={(event) => onChange({ handle: event.target.value })}
                    placeholder="afterhours"
                    className={`${fieldClass} !h-10 !pl-7`}
                  />
                </span>
              </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">Bio</span>
              <textarea
                rows={2}
                disabled={isGenerating || isPending}
                value={draft.bio}
                maxLength={500}
                onChange={(event) => onChange({ bio: event.target.value })}
                className={`${textareaClass} !min-h-0`}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">Stage voice</span>
              <textarea
                rows={2}
                disabled={isGenerating || isPending}
                value={draft.stagePersonality}
                maxLength={1000}
                onChange={(event) => onChange({ stagePersonality: event.target.value })}
                placeholder="Voice, attitude, boundaries, and creator persona"
                className={`${textareaClass} !min-h-0`}
              />
            </label>
          </div>
          <details className="group overflow-visible rounded-lg border border-[var(--noodle-divider)]">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--noodle-blue)] [&::-webkit-details-marker]:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--noodle-blue)]/15 text-[var(--noodle-blue)]">
                <Sparkles size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">AI guidance</span>
                <span className="block text-xs leading-5 text-[var(--muted-foreground)]">
                  Generate or rewrite an editable profile draft.
                </span>
              </span>
              <ChevronDown
                size={18}
                className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t border-[var(--noodle-divider)] p-4">
              <label className="block space-y-2">
                <span className="text-xs font-semibold">Optional direction for AI</span>
                <textarea
                  value={guidance}
                  maxLength={2000}
                  disabled={isGenerating || isPending}
                  onChange={(event) => onGuidanceChange(event.target.value)}
                  placeholder="A mysterious late-night photographer with a warm but guarded voice"
                  className={`${textareaClass} min-h-20`}
                />
              </label>
              {connections.length === 0 && (
                <p className="mt-3 rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-3 text-xs leading-5">
                  No connections configured. Add one in Settings → Connections.
                </p>
              )}
              <div className="mt-3 flex items-center justify-end gap-2">
                {connections.length > 0 && (
                  <div ref={connectionPickerRef} className="relative shrink-0">
                    <button
                      type="button"
                      disabled={isGenerating || isPending}
                      onClick={() => setConnectionPickerOpen((open) => !open)}
                      aria-label={`Generation connection: ${selectedConnection?.name ?? "Default connection"}`}
                      aria-haspopup="listbox"
                      aria-expanded={connectionPickerOpen}
                      title={`Connection: ${selectedConnection?.name ?? "Default connection"}`}
                      className={cn(
                        "flex h-11 max-w-[calc(100%-10.5rem)] items-center justify-center gap-2 rounded-md border border-[var(--noodle-divider)] px-3 transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)] sm:max-w-64",
                        connectionPickerOpen && "border-[var(--noodle-blue)] bg-[var(--noodle-blue)]/10",
                        (isGenerating || isPending) && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <Link size={18} className="shrink-0 !text-[var(--noodle-blue)]" />
                      <span className="truncate text-xs font-semibold">
                        {selectedConnection?.name ?? "Default connection"}
                      </span>
                    </button>
                    {connectionPickerOpen && (
                      <div
                        role="listbox"
                        aria-label="Generation connections"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            setConnectionPickerOpen(false);
                          }
                        }}
                        className="absolute bottom-full left-0 z-50 mb-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-foreground/10 bg-[var(--card)] shadow-2xl"
                      >
                        <div className="border-b border-foreground/10 px-3 py-2 text-[0.6875rem] font-semibold">
                          Connections
                        </div>
                        <div className="max-h-60 overflow-y-auto p-1">
                          <button
                            type="button"
                            role="option"
                            aria-selected={!connectionId}
                            onClick={() => {
                              onConnectionChange("");
                              setConnectionPickerOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/10",
                              !connectionId && "bg-foreground/5 font-semibold",
                            )}
                          >
                            <span className="flex-1 truncate">Default connection</span>
                            {!connectionId && <Check size={14} />}
                          </button>
                          {connections.map((connection) => {
                            const isSelected = connection.id === connectionId;
                            return (
                              <button
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                key={connection.id}
                                onClick={() => {
                                  onConnectionChange(connection.id);
                                  setConnectionPickerOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-foreground/10",
                                  isSelected && "bg-foreground/5 font-semibold",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{connection.name}</span>
                                  {connection.model && (
                                    <span className="block truncate text-[0.6875rem] font-normal text-[var(--muted-foreground)]">
                                      {connection.model}
                                    </span>
                                  )}
                                </span>
                                {isSelected && <Check size={14} className="shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={isGenerating || isPending || connections.length === 0}
                  className="inline-flex min-h-11 w-40 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--noodle-blue)] px-4 text-sm font-bold text-zinc-950 [&_svg]:!text-zinc-950 hover:opacity-90 disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{" "}
                  {isGenerating
                    ? "Generating draft..."
                    : previousDraft
                      ? "Rewrite draft"
                      : "Generate draft"}
                </button>
              </div>
              {previousDraft && !isGenerating && (
                <button
                  type="button"
                  onClick={onUndoDraft}
                  className="mt-1 flex min-h-11 w-full items-center justify-center text-xs font-semibold text-[var(--noodle-blue)] hover:underline"
                >
                  Undo AI changes
                </button>
              )}
            </div>
          </details>
        </div>
      </div>
      <WizardFooter
        step={2}
        onBack={onCancel}
        backLabel={isEditing ? "Cancel" : "Back"}
        showProgress={!isEditing}
        disabled={isPending || isGenerating}
        finalAction={
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--noodle-blue)] px-5 text-sm font-bold text-zinc-950 [&_svg]:!text-zinc-950 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {isPending ? "Saving..." : isEditing ? "Save changes" : "Create stage profile"}
          </button>
        }
      />
    </div>
  );
}

function StageProfileSourcePicker({
  accounts,
  search,
  kind,
  selectedId,
  onSearch,
  onKindChange,
  onSelect,
  hasMore,
  isLoadingMore,
  isLoading,
  isError,
  onRetry,
  onLoadMore,
  onBack,
  onContinue,
}: {
  accounts: Array<{
    id: string;
    kind: "character" | "persona" | "random_user";
    displayName: string;
    handle: string;
    bio: string;
    avatarUrl: string | null;
  }>;
  search: string;
  kind: "all" | "character" | "persona";
  selectedId: string | null;
  onSearch: (value: string) => void;
  onKindChange: (value: "all" | "character" | "persona") => void;
  onSelect: (id: string) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="px-4 py-5 sm:px-6 lg:py-6">
        <h2 className="text-xl font-black">Choose a source character or persona</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">
          NoodleR will create a separate stage identity from this character or persona. You will choose exactly how much
          of the public identity can carry over next.
        </p>
        <label className="relative mt-5 block">
          <Search size={16} className="absolute left-3 top-3 text-[var(--muted-foreground)]" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search characters and personas"
            className={`${fieldClass} pl-9`}
          />
        </label>
        {selectedId && !accounts.some((account) => account.id === selectedId) && (
          <p className="mt-3 rounded-md border border-[var(--noodle-blue)]/40 bg-[var(--noodle-blue)]/10 p-3 text-xs leading-5 text-[var(--foreground)]">
            A selected source is hidden by the current search or filter. Clear the search or switch to All to review it.
          </p>
        )}
        {isLoading ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-[var(--noodle-divider)] py-12 text-sm text-[var(--muted-foreground)]">
            <Loader2 size={18} className="animate-spin" /> Loading sources...
          </div>
        ) : isError ? (
          <div className="mt-4 rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/5 p-6 text-center">
            <p className="text-sm font-semibold">Sources could not be loaded.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 min-h-11 rounded-md border border-[var(--noodle-divider)] px-4 text-sm font-semibold hover:bg-[var(--accent)]"
            >
              Try again
            </button>
          </div>
        ) : (
          <div
            className="mt-3 grid grid-cols-3 rounded-lg border border-[var(--noodle-divider)] p-1"
            aria-label="Filter profile sources"
          >
            {(["all", "character", "persona"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => onKindChange(option)}
                className={`min-h-11 rounded-md px-2 text-xs font-semibold capitalize ${kind === option ? "bg-[var(--noodle-blue)] text-zinc-950" : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"}`}
              >
                {option === "all" ? "All" : option === "character" ? "Characters" : "Personas"}
              </button>
            ))}
          </div>
        )}
        {!isLoading && !isError && (
          <div className="mt-4 max-h-[min(28rem,50vh)] divide-y divide-[var(--noodle-divider)] overflow-y-auto rounded-lg border border-[var(--noodle-divider)]">
            {accounts.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">
                No eligible source accounts match that search.
              </p>
            ) : (
              accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => onSelect(account.id)}
                  className={`flex min-h-16 w-full items-center gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--noodle-blue)] ${selectedId === account.id ? "bg-[var(--noodle-blue)]/10" : "hover:bg-[var(--accent)]"}`}
                >
                  {account.avatarUrl ? (
                    <img src={account.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <ProfileInitial profile={account} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{account.displayName}</span>
                    <span className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <span className="truncate">@{account.handle}</span>
                      <span className="shrink-0 rounded-full border border-[var(--noodle-divider)] px-1.5 py-0.5 text-[0.625rem] font-bold capitalize">
                        {account.kind}
                      </span>
                    </span>
                    {account.bio && (
                      <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">{account.bio}</span>
                    )}
                  </span>
                  {selectedId === account.id ? (
                    <Check size={18} className="text-[var(--noodle-blue)]" />
                  ) : (
                    <ChevronRight size={17} className="text-[var(--muted-foreground)]" />
                  )}
                </button>
              ))
            )}
          </div>
        )}
        {!isLoading && !isError && hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--noodle-divider)] text-sm font-semibold hover:bg-[var(--accent)] disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 size={15} className="animate-spin" />}
            {isLoadingMore ? "Loading more..." : "Load more characters"}
          </button>
        )}
      </div>
      <WizardFooter
        step={0}
        onBack={onBack}
        onNext={onContinue}
        nextDisabled={!selectedId || !accounts.some((account) => account.id === selectedId)}
      />
    </div>
  );
}

function DisclosureStep({
  source,
  value,
  onChange,
  onBack,
  onContinue,
}: {
  source: { displayName: string; handle: string } | null;
  value: NoodleIdentityDisclosure;
  onChange: (value: NoodleIdentityDisclosure) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="px-4 py-5 sm:px-6 lg:py-6">
        <h2 className="text-xl font-black">How connected should this feel?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Choose the relationship between this private stage identity and the character or persona you selected. This is
          about identity disclosure, not access, subscriptions, or who can view posts.
        </p>
        {source && (
          <p className="mt-4 rounded-md bg-[var(--accent)] p-3 text-xs text-[var(--muted-foreground)]">
            Source: <span className="font-bold text-[var(--foreground)]">{source.displayName}</span> (@{source.handle})
          </p>
        )}
        <div className="mt-5 space-y-3">
          {DISCLOSURE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
              className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left ${value === option.value ? "border-[var(--noodle-blue)] bg-[var(--noodle-blue)]/10" : "border-[var(--noodle-divider)] hover:bg-[var(--accent)]"}`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${value === option.value ? "border-[var(--noodle-blue)] bg-[var(--noodle-blue)]" : "border-[var(--noodle-divider)]"}`}
              >
                {value === option.value && <Check size={13} className="!text-zinc-950" />}
              </span>
              <span>
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{option.detail}</span>
                <span className="mt-2 block text-xs leading-5 text-[var(--muted-foreground)]">{option.guidance}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <WizardFooter step={1} onBack={onBack} onNext={onContinue} />
    </div>
  );
}

function WizardFooter({
  step,
  onBack,
  onNext,
  nextDisabled = false,
  finalAction,
  disabled = false,
  backLabel = "Back",
  showProgress = true,
}: {
  step: 0 | 1 | 2;
  onBack: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  finalAction?: ReactNode;
  disabled?: boolean;
  backLabel?: string;
  showProgress?: boolean;
}) {
  const labels = ["Source", "Disclosure", "Profile"];
  return (
    <div className="sticky bottom-0 z-[60] shrink-0 border-t border-[var(--noodle-divider)] bg-[var(--background)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      {showProgress && (
        <div
          className="mb-3 flex items-center justify-center gap-1.5"
          role="status"
          aria-label={`Step ${step + 1} of ${labels.length}: ${labels[step]}`}
        >
          {labels.map((label, index) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                aria-current={index === step ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${label}${index === step ? ", current" : index < step ? ", complete" : ""}`}
                title={label}
                className={`h-1.5 rounded-full transition-all ${index === step ? "w-6 bg-[var(--noodle-blue)]" : index < step ? "w-4 bg-[var(--noodle-blue)]/45" : "w-2 bg-[var(--muted-foreground)]/25"}`}
              />
              {index < labels.length - 1 && <span className="sr-only">to</span>}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--noodle-divider)] px-4 text-sm font-semibold hover:bg-[var(--accent)] disabled:cursor-wait disabled:opacity-50"
        >
          <ArrowLeft size={15} /> {backLabel}
        </button>
        {finalAction ?? (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || disabled}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--noodle-blue)] px-5 text-sm font-bold text-zinc-950 [&_svg]:!text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function StageProfileView({
  profile,
  posts,
  viewerCreator,
  viewerAccount,
  postCardCtx,
  viewerAccounts,
  viewerIsLoading,
  viewerIsError,
  onRetryViewer,
  draft,
  onDraftChange,
  onClearDraft,
  isLoading,
  isError,
  onRetry,
  onEdit,
  onDelete,
  onManualPost,
  onGuidedPost,
  manualPending,
  guidePending,
  onUnlock,
  unlockPending,
  onToggleSubscription,
  subscriptionPending,
  accessPending,
  deletePending,
  onAccessChange,
}: {
  profile: NoodlerManagedStageProfile;
  posts: NoodlerManagedPost[];
  viewerCreator: NonNullable<ReturnType<typeof useNoodlerViewer>["data"]>["creators"][number] | null;
  viewerAccount: NoodleAccount | null;
  postCardCtx: ReturnType<typeof useNoodlePostCardController>["ctx"];
  viewerAccounts: NoodleAccount[];
  viewerIsLoading: boolean;
  viewerIsError: boolean;
  onRetryViewer: () => void;
  draft: PrivatePostDraft;
  onDraftChange: (patch: Partial<PrivatePostDraft>) => void;
  onClearDraft: () => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManualPost: (input: PrivatePostSubmission) => Promise<void>;
  onGuidedPost: (input: PrivatePostSubmission) => Promise<void>;
  manualPending: boolean;
  guidePending: boolean;
  onUnlock: (postId: string) => void;
  unlockPending: boolean;
  onToggleSubscription: (creatorAccountId: string, subscribed: boolean) => void;
  subscriptionPending: boolean;
  accessPending: boolean;
  deletePending: boolean;
  onAccessChange: (access: NoodlerManagedStageProfile["access"]) => void;
}) {
  const [accessSettingsOpen, setAccessSettingsOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [rescheduleDraft, setRescheduleDraft] = useState("");
  const updateAutoPosting = useUpdateNoodlerAutoPosting();
  const rescheduleAutoPost = useRescheduleNoodlerAutoPost();
  const autoPosting = profile.autoPosting;
  const [activeTab, setActiveTab] = useState<NoodlerProfileTab>("posts");
  const [revealedManagedPostIds, setRevealedManagedPostIds] = useState<Set<string>>(() => new Set());
  const subscribersQuery = useNoodlerSubscribers(profile.id);
  const accent = useNoodleAccent();
  const viewingOwnCreator = Boolean(viewerAccount && profile.publicAccountId === viewerAccount.id);
  const viewerPostById = new Map((viewerCreator?.posts ?? []).map((post) => [post.id, post]));
  const projectedPosts = posts.map((managedPost) => {
    const viewerPost = viewerPostById.get(managedPost.id);
    if (revealedManagedPostIds.has(managedPost.id)) {
      return {
        kind: "managed-reveal" as const,
        model: toManagedPostCardModel(managedPost, profile),
      };
    }
    if (!viewerPost) {
      return {
        kind: "controller-locked" as const,
        post: managedPost,
      };
    }
    return viewerPost.locked
      ? { kind: "locked" as const, post: viewerPost }
      : { kind: "card" as const, model: toNoodlePostCardModel(viewerPost, profile) };
  });
  const visiblePosts = projectedPosts.filter((item) => {
    if (activeTab === "posts") return true;
    if (item.kind === "locked" || item.kind === "controller-locked") return false;
    if (activeTab === "media") return Boolean(item.model.imageUrl);
    return false;
  });
  const cards = (
    <>
      {activeTab === "subscribers" ? (
        subscribersQuery.isLoading ? (
          <div className="flex justify-center py-12" role="status" aria-label="Loading subscribers">
            <Loader2 size={22} className="animate-spin text-[var(--noodle-blue)]" />
          </div>
        ) : subscribersQuery.isError ? (
          <EmptyState
            title="Subscribers could not be loaded."
            action="Try again"
            onAction={() => void subscribersQuery.refetch()}
          />
        ) : (subscribersQuery.data ?? []).length > 0 ? (
          <div>
            {(subscribersQuery.data ?? []).map((subscriber) => (
              <div
                key={subscriber.id}
                className="flex min-h-16 items-center gap-3 border-b border-[var(--noodle-divider)] px-4 py-3"
              >
                <Avatar account={subscriber} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{subscriber.displayName}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">@{subscriber.handle}</p>
                </div>
                <time
                  dateTime={subscriber.subscribedAt}
                  className="shrink-0 text-xs text-[var(--muted-foreground)]"
                >
                  {new Date(subscriber.subscribedAt).toLocaleDateString()}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No subscribers yet."
            detail="When a viewer subscribes to this creator, they will appear here."
          />
        )
      ) : viewerIsLoading || isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-[var(--noodle-blue)]" /></div>
      ) : viewerIsError ? (
        <EmptyState
          title="Viewer access could not be loaded."
          action="Try again"
          onAction={onRetryViewer}
        />
      ) : isError ? (
        <EmptyState
          title="Private posts could not be loaded."
          action="Try again"
          onAction={onRetry}
        />
      ) : visiblePosts.length > 0 ? visiblePosts.map((item) =>
          item.kind === "locked" || item.kind === "controller-locked" ? (
            <LockedPrivatePostCard
              key={item.post.id}
              post={item.post}
              profile={profile}
              controllerOnly={item.kind === "controller-locked"}
              subscribed={viewerCreator?.subscribed ?? false}
              unlockPending={unlockPending}
              subscriptionPending={subscriptionPending}
              onUnlock={onUnlock}
              onToggleSubscription={onToggleSubscription}
              onManage={() => {
                setRevealedManagedPostIds((current) => {
                  const next = new Set(current);
                  next.add(item.post.id);
                  return next;
                });
              }}
            />
          ) : item.kind === "managed-reveal" ? (
            <div key={item.model.id}>
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--noodle-divider)] bg-[var(--noodle-blue)]/5 px-4">
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                  Controller view · hidden from {viewerAccount?.displayName ?? "this viewer"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setRevealedManagedPostIds((current) => {
                      const next = new Set(current);
                      next.delete(item.model.id);
                      return next;
                    })
                  }
                  className="min-h-11 shrink-0 px-2 text-xs font-bold text-[var(--noodle-blue)]"
                >
                  Hide
                </button>
              </div>
              <NoodlePostCard
                post={item.model}
                ctx={{ ...postCardCtx, personaAccount: null, postManagement: true }}
              />
            </div>
          ) : (
            <NoodlePostCard
              key={item.model.id}
              post={item.model}
              ctx={{
                ...postCardCtx,
                personaAccount: viewingOwnCreator ? null : viewerAccount,
                postManagement: true,
              }}
            />
          ),
        ) : (
          <EmptyState title={activeTab === "posts" ? "No private posts yet." : `No ${activeTab} posts yet.`} />
        )}
    </>
  );
  return (
    <>
      <NoodleProfileSurface
        mobileHeader={null}
        account={profile}
        displayHandle={profile.handle}
        handleMeta={<>
          {profile.disclosureMode === "hinted" && profile.publicIdentity ? (
            <HelpTooltip
              label="Hinted"
              side="bottom"
              buttonClassName="border border-[var(--noodle-divider)] px-2 py-0.5 text-[0.68rem] font-bold text-[var(--muted-foreground)] opacity-100 [&_svg]:hidden"
              text={
                <span>
                  <span className="block font-bold text-[var(--popover-foreground)]">Linked identity</span>
                  <span className="mt-1 block">
                    {profile.publicIdentity.displayName} (@{profile.publicIdentity.handle})
                  </span>
                </span>
              }
            />
          ) : (
            <DisclosureBadge mode={profile.disclosureMode} />
          )}
          {profile.disclosureMode === "open" && profile.publicIdentity && (
            <span className="text-xs text-[var(--muted-foreground)]">
              Openly linked to {profile.publicIdentity.displayName} (@{profile.publicIdentity.handle})
            </span>
          )}
        </>}
        decorativeBanner
        leadingActions={
          viewingOwnCreator ? (
            <span className="inline-flex h-9 items-center rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-bold text-[var(--muted-foreground)]">
              Your Profile
            </span>
          ) : viewerCreator ? (
            <button
              type="button"
              disabled={subscriptionPending}
              onClick={() => onToggleSubscription(profile.id, viewerCreator.subscribed)}
              className={cn(
                "h-9 rounded-full px-4 text-xs font-bold hover:bg-[var(--accent)] disabled:opacity-50",
                viewerCreator.subscribed
                  ? "border border-[var(--noodle-divider)] text-[var(--foreground)]"
                  : "bg-[var(--foreground)] text-[var(--background)]",
              )}
            >
              {viewerCreator.subscribed ? "Subscribed" : "Subscribe"}
            </button>
          ) : undefined
        }
        bioContent={profile.bio && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{profile.bio}</p>}
        contentActions={
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="h-9 rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90"
            >
              Edit Profile
            </button>
            <button
              type="button"
              onClick={() => setAccessSettingsOpen(true)}
              className="h-9 rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-bold hover:bg-[var(--accent)]"
            >
              Access
            </button>
            <button
              type="button"
              onClick={() => setAutomationOpen(true)}
              className="h-9 rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-bold hover:bg-[var(--accent)]"
            >
              {autoPosting.enabled ? "Automation · On" : "Automation"}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deletePending}
              aria-label={`Delete ${profile.displayName} profile`}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--destructive)]/45 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 disabled:cursor-wait disabled:opacity-50"
            >
              {deletePending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </div>
        }
        tabs={[
          { id: "posts", label: "Posts" },
          { id: "media", label: "Media" },
          {
            id: "subscribers",
            label: `Subscribers (${subscribersQuery.data?.length ?? "…"})`,
            ariaLabel: `Subscribers, ${subscribersQuery.data?.length ?? "loading"} total`,
          },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        preTabsContent={
          <PrivatePostComposer
            key={profile.id}
            profile={profile}
            draft={draft}
            onDraftChange={onDraftChange}
            onClearDraft={onClearDraft}
            onManualPost={onManualPost}
            onGuidedPost={onGuidedPost}
            manualPending={manualPending}
            guidePending={guidePending}
          />
        }
        postList={cards}
      />
      <Modal
        open={accessSettingsOpen}
        onClose={() => setAccessSettingsOpen(false)}
        title="Subscriber access"
        width="max-w-md"
        panelStyle={{ "--noodle-blue": accent } as React.CSSProperties}
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">
              These rules apply only to this stage profile.
            </p>
            {accessPending && <Loader2 size={16} className="shrink-0 animate-spin text-[var(--noodle-blue)]" />}
          </div>
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--noodle-divider)] px-3 py-2">
            <span>
              <span className="block text-xs font-bold">Subscriptions include PPV</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                Subscribers skip individual PPV unlocks.
              </span>
            </span>
            <input
              type="checkbox"
              checked={profile.access.subscriptionIncludesPpv}
              disabled={accessPending}
              onChange={(event) => onAccessChange({ ...profile.access, subscriptionIncludesPpv: event.target.checked })}
              className="h-5 w-5 accent-[var(--noodle-blue)]"
            />
          </label>
          {viewerAccounts.length > 0 && (
            <fieldset>
              <legend className="text-xs font-bold">Hidden from personas</legend>
              <div className="mt-2 divide-y divide-[var(--noodle-divider)] rounded-md border border-[var(--noodle-divider)]">
                {viewerAccounts.map((account) => {
                  const owningAccount = profile.publicAccountId === account.id;
                  const checked = profile.access.hiddenFromAccountIds.includes(account.id);
                  return (
                    <label key={account.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                      <span className="truncate text-xs font-semibold">{account.displayName}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={accessPending || owningAccount}
                        onChange={(event) =>
                          onAccessChange({
                            ...profile.access,
                            hiddenFromAccountIds: event.target.checked
                              ? [...profile.access.hiddenFromAccountIds, account.id]
                              : profile.access.hiddenFromAccountIds.filter((id) => id !== account.id),
                          })
                        }
                        className="h-5 w-5 accent-[var(--noodle-blue)]"
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
      </Modal>
      <Modal
        open={automationOpen}
        onClose={() => setAutomationOpen(false)}
        title="Automatic posting"
        width="max-w-md"
        panelStyle={{ "--noodle-blue": accent } as React.CSSProperties}
      >
        <div className="space-y-4">
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">
            When on, this creator posts on its own while Marinara runs, guided by its stage
            identity and personality. Automatic posts are subscriber-only.
          </p>
          <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--noodle-divider)] px-3 py-2">
            <span className="text-xs font-bold">Automatic posting enabled</span>
            <input
              type="checkbox"
              checked={autoPosting.enabled}
              disabled={updateAutoPosting.isPending}
              onChange={(event) =>
                updateAutoPosting.mutate(
                  { accountId: profile.id, enabled: event.target.checked },
                  { onError: (error) => toast.error(errorMessage(error, "Could not update automatic posting.")) },
                )
              }
              className="h-5 w-5 accent-[var(--noodle-blue)]"
            />
          </label>
          <fieldset disabled={!autoPosting.enabled || updateAutoPosting.isPending} className="disabled:opacity-50">
            <legend className="text-xs font-bold">Cadence</legend>
            <div className="mt-2 flex gap-2">
              {AUTO_POST_INTENSITIES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    updateAutoPosting.mutate(
                      { accountId: profile.id, intensity: value },
                      { onError: (error) => toast.error(errorMessage(error, "Could not update cadence.")) },
                    )
                  }
                  className={cn(
                    "h-9 flex-1 rounded-full border px-3 text-xs font-bold",
                    autoPosting.intensity === value
                      ? "border-transparent bg-[var(--noodle-blue)] text-zinc-950"
                      : "border-[var(--noodle-divider)] hover:bg-[var(--accent)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[0.68rem] text-[var(--muted-foreground)]">
              About {autoPosting.intensity} automatic post{autoPosting.intensity === 1 ? "" : "s"} per day.
            </p>
          </fieldset>
          {autoPosting.enabled && (
            <div className="space-y-2 rounded-md border border-[var(--noodle-divider)] px-3 py-2">
              <p className="text-xs font-bold">Next automatic post</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {autoPosting.nextRunAt
                  ? new Date(autoPosting.nextRunAt).toLocaleString()
                  : "Scheduling the first run…"}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={rescheduleDraft}
                  onChange={(event) => setRescheduleDraft(event.target.value)}
                  className="min-h-9 flex-1 rounded-md border border-[var(--noodle-divider)] bg-transparent px-2 text-xs"
                />
                <button
                  type="button"
                  disabled={!rescheduleDraft || rescheduleAutoPost.isPending}
                  onClick={() => {
                    const next = new Date(rescheduleDraft);
                    if (Number.isNaN(next.getTime()) || next.getTime() <= Date.now()) {
                      toast.error("Pick a future date and time to reschedule.");
                      return;
                    }
                    rescheduleAutoPost.mutate(
                      { accountId: profile.id, nextRunAt: next.toISOString() },
                      {
                        onSuccess: () => setRescheduleDraft(""),
                        onError: (error) => toast.error(errorMessage(error, "Could not reschedule the next post.")),
                      },
                    );
                  }}
                  className="h-9 rounded-full border border-[var(--noodle-divider)] px-3 text-xs font-bold hover:bg-[var(--accent)] disabled:opacity-50"
                >
                  Reschedule
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

const AUTO_POST_INTENSITIES: { label: string; value: NoodleAutoPostingIntensity }[] = [
  { label: "Low", value: 1 },
  { label: "Medium", value: 3 },
  { label: "High", value: 6 },
];

function ViewerHub({
  personas,
  scope,
  isLoading,
  isError,
  onRetry,
  onRefresh,
  isRefreshing,
  unlockPending,
  postCardCtx,
  onUnlock,
  search,
  tab,
  onTabChange,
  authorProfile,
  authorDraft,
  onAuthorDraftChange,
  onClearAuthorDraft,
  authorLoading,
  authorError,
  onRetryAuthor,
  onCreateAuthorProfile,
  onOpenAuthorProfile,
  onManualPost,
  onGuidedPost,
  manualPending,
  guidePending,
  onToggleSubscription,
  togglePending,
}: {
  personas: Persona[];
  scope: ReturnType<typeof useNoodlerViewer>["data"];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  unlockPending: boolean;
  postCardCtx: ReturnType<typeof useNoodlePostCardController>["ctx"];
  onUnlock: (postId: string) => void;
  search: string;
  tab: "all" | "subscribed";
  onTabChange: (tab: "all" | "subscribed") => void;
  authorProfile: NoodlerManagedStageProfile | null;
  authorDraft: PrivatePostDraft;
  onAuthorDraftChange: (patch: Partial<PrivatePostDraft>) => void;
  onClearAuthorDraft: () => void;
  authorLoading: boolean;
  authorError: boolean;
  onRetryAuthor: () => void;
  onCreateAuthorProfile?: () => void;
  onOpenAuthorProfile?: () => void;
  onManualPost: (input: PrivatePostSubmission) => Promise<void>;
  onGuidedPost: (input: PrivatePostSubmission) => Promise<void>;
  manualPending: boolean;
  guidePending: boolean;
  onToggleSubscription: (creatorAccountId: string, subscribed: boolean) => void;
  togglePending: boolean;
}) {
  if (personas.length === 0) {
    return (
      <EmptyState
        title="Create a persona to browse NoodleR."
        detail="Subscriptions and unlocks belong to one viewer persona."
      />
    );
  }
  const searchTerm = search.trim().toLowerCase();
  const feed = (scope?.creators ?? [])
    .filter((creator) => tab === "all" || creator.subscribed)
    .flatMap((creator) => creator.posts.map((post) => ({ post, creator })))
    .filter(
      ({ post, creator }) =>
        !searchTerm ||
        (post.title ?? "").toLowerCase().includes(searchTerm) ||
        (post.content ?? "").toLowerCase().includes(searchTerm) ||
        creator.profile.handle.toLowerCase().includes(searchTerm) ||
        creator.profile.displayName.toLowerCase().includes(searchTerm),
    )
    .sort((a, b) => new Date(b.post.createdAt).getTime() - new Date(a.post.createdAt).getTime());
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-2 border-b border-[var(--noodle-divider)]">
        {(
          [
            { id: "all", label: "All creators" },
            { id: "subscribed", label: "Subscribed" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onTabChange(option.id)}
            className={cn(
              "relative flex h-12 items-center justify-center text-sm font-bold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
              tab === option.id && "text-[var(--foreground)]",
            )}
            aria-pressed={tab === option.id}
          >
            {option.label}
            {tab === option.id && (
              <span className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-[var(--noodle-blue)]" />
            )}
          </button>
        ))}
      </div>
      <div className="hidden border-b border-[var(--noodle-divider)] px-4 py-3 lg:block xl:hidden">
        <SubscriptionSections
          creators={(scope?.creators ?? []).filter((creator) => creator.profile.id !== authorProfile?.id)}
          onToggleSubscription={onToggleSubscription}
          togglePending={togglePending}
        />
      </div>
      {authorProfile ? (
        <PrivatePostComposer
          key={authorProfile.id}
          profile={authorProfile}
          collapsible={false}
          draft={authorDraft}
          onDraftChange={onAuthorDraftChange}
          onClearDraft={onClearAuthorDraft}
          onManualPost={onManualPost}
          onGuidedPost={onGuidedPost}
          manualPending={manualPending}
          guidePending={guidePending}
        />
      ) : authorLoading ? (
        <div className="border-b border-[var(--noodle-divider)] px-4 py-4 text-xs text-[var(--muted-foreground)]">
          Resolving your linked NoodleR profile…
        </div>
      ) : authorError ? (
        <div className="border-b border-[var(--noodle-divider)] px-4 py-4">
          <p className="text-sm font-semibold">Your linked NoodleR profile could not be loaded.</p>
          <button type="button" onClick={onRetryAuthor} className="mt-3 min-h-10 rounded-md border border-[var(--noodle-divider)] px-3 text-xs font-bold hover:bg-[var(--accent)]">Try again</button>
        </div>
      ) : (
        <div className="border-b border-[var(--noodle-divider)] px-4 py-4">
          <p className="text-sm font-semibold">This persona has no linked NoodleR profile.</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">Create one to author from this timeline.</p>
          {onCreateAuthorProfile && (
            <button
              type="button"
              onClick={onCreateAuthorProfile}
              className="mt-3 min-h-10 rounded-md border border-[var(--noodle-divider)] px-3 text-xs font-bold hover:bg-[var(--accent)]"
            >
              Create stage profile
            </button>
          )}
        </div>
      )}
      <div className="border-b border-[var(--noodle-divider)] px-4 py-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
          title="Refresh timeline"
          aria-label="Refresh timeline"
        >
          {isRefreshing ? (
            <Loader2 size={17} className="!text-[var(--noodle-blue)] animate-spin" />
          ) : (
            <RefreshCw size={17} className="!text-[var(--noodle-blue)]" />
          )}
          {isRefreshing ? "Refreshing" : "Refresh timeline"}
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--noodle-blue)]" />
        </div>
      ) : isError ? (
        <EmptyState title="NoodleR could not be loaded for this persona." action="Try again" onAction={onRetry} />
      ) : scope && scope.creators.length > 0 ? (
        <>
          {feed.length === 0 ? (
            <p className="px-4 py-8 text-xs text-[var(--muted-foreground)]">No posts yet.</p>
          ) : (
            <div>
              {feed.map(({ post, creator }) =>
                post.locked ? (
                  <LockedPrivatePostCard
                    key={post.id}
                    post={post}
                    profile={creator.profile}
                    subscribed={creator.subscribed}
                    unlockPending={unlockPending}
                    subscriptionPending={togglePending}
                    onUnlock={onUnlock}
                    onToggleSubscription={onToggleSubscription}
                  />
                ) : (
                  <NoodlePostCard
                    key={post.id}
                    post={toNoodlePostCardModel(post, creator.profile)}
                    ctx={{
                      ...postCardCtx,
                      personaAccount: creator.profile.id === authorProfile?.id ? null : postCardCtx.personaAccount,
                    }}
                  />
                ),
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title={authorProfile ? "No other stage profiles are visible to this persona." : "No stage profiles are visible to this persona."}
          detail={authorProfile ? "Your own stage profile and its posts are still available." : undefined}
          action={authorProfile && onOpenAuthorProfile ? `View ${authorProfile.displayName}` : undefined}
          onAction={authorProfile ? onOpenAuthorProfile : undefined}
        />
      )}
    </div>
  );
}

function LockedPrivatePostCard({
  post,
  profile,
  controllerOnly = false,
  subscribed,
  unlockPending,
  subscriptionPending,
  onUnlock,
  onToggleSubscription,
  onManage,
}: {
  post: Pick<NoodlerPostView, "id" | "access" | "ppvPrice" | "createdAt">;
  profile: NoodlerStageProfile;
  controllerOnly?: boolean;
  subscribed: boolean;
  unlockPending: boolean;
  subscriptionPending: boolean;
  onUnlock: (postId: string) => void;
  onToggleSubscription: (creatorAccountId: string, subscribed: boolean) => void;
  onManage?: () => void;
}) {
  return (
    <article className="flex gap-3 border-b border-[var(--noodle-divider)] px-4 py-4">
      <ProfileInitial profile={profile} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">
          {profile.displayName}{" "}
          <span className="font-normal text-[var(--muted-foreground)]">@{profile.handle} · {formatTime(post.createdAt)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-[var(--noodle-divider)] p-3">
          <Lock size={18} className="shrink-0 text-[var(--noodle-blue)]" />
          <div className="min-w-40 flex-1">
            <p className="text-xs font-bold">
              {controllerOnly
                ? "Not visible to this viewer"
                : post.access === "ppv"
                  ? "PPV post"
                  : "Subscriber-only post"}
            </p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              {controllerOnly
                ? "Open the controller tools to manage this post."
                : post.access === "ppv"
                  ? `${post.ppvPrice ?? 0} credits to unlock`
                  : "Subscribe to reveal this post."}
            </p>
          </div>
          {!controllerOnly &&
            (post.access === "ppv" ? (
              <button
                type="button"
                disabled={unlockPending}
                onClick={() => onUnlock(post.id)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--noodle-blue)] px-3 text-xs font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:!text-zinc-950"
              >
                <Eye size={14} /> Unlock
              </button>
            ) : (
              <button
                type="button"
                disabled={subscriptionPending}
                onClick={() => onToggleSubscription(profile.id, subscribed)}
                className="min-h-10 rounded-md bg-[var(--noodle-blue)] px-3 text-xs font-bold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Subscribe
              </button>
            ))}
          {onManage && (
            <button
              type="button"
              onClick={onManage}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--noodle-divider)] px-3 text-xs font-bold hover:bg-[var(--accent)]"
            >
              <Pencil size={14} />
              Manage post
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

type PrivateComposerTool = "media" | "coin";

function PrivatePostComposer({
  profile,
  collapsible = true,
  draft,
  onDraftChange,
  onClearDraft,
  onManualPost,
  onGuidedPost,
  manualPending,
  guidePending,
}: {
  profile: NoodlerManagedStageProfile;
  collapsible?: boolean;
  draft: PrivatePostDraft;
  onDraftChange: (patch: Partial<PrivatePostDraft>) => void;
  onClearDraft: () => void;
  onManualPost: (input: PrivatePostSubmission) => Promise<void>;
  onGuidedPost: (input: PrivatePostSubmission) => Promise<void>;
  manualPending: boolean;
  guidePending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<PrivateComposerTool | null>(null);
  const [mediaPickerTab, setMediaPickerTab] = useState<ConversationMediaPickerTabId>("emoji");
  const mediaToolRef = useRef<HTMLDivElement | null>(null);
  const coinToolRef = useRef<HTMLDivElement | null>(null);
  const { title, body, access, ppvPrice } = draft;
  const hasDraft = !isEmptyPrivatePostDraft(draft);
  const parsedPrice = Number(ppvPrice);
  const pending = manualPending || guidePending;
  const guide = serializePrivatePostGuide(title, body);

  const clearDraft = () => {
    onClearDraft();
    setPostError(null);
    setGuideError(null);
    setActiveTool(null);
    setExpanded(false);
  };

  const toggleTool = (tool: PrivateComposerTool) =>
    setActiveTool((current) => (current === tool ? null : tool));

  const submission = (): PrivatePostSubmission => ({
    profileId: profile.id,
    title,
    body,
    access,
    ppvPrice: access === "ppv" ? parsedPrice : null,
  });

  const publish = async () => {
    setPostError(null);
    if (!body.trim()) {
      setPostError("A literal post needs a body.");
      return;
    }
    if (access === "ppv" && (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 999_999)) {
      setPostError("Enter a PPV price from 0 to 999,999 credits.");
      return;
    }
    try {
      await onManualPost(submission());
      clearDraft();
    } catch (error) {
      setPostError(errorMessage(error, "Could not publish this post."));
    }
  };

  const guidePost = async () => {
    setGuideError(null);
    if (guide.length > NOODLE_PRIVATE_POST_GUIDE_MAX_LENGTH) {
      setGuideError(
        `The combined title and body guide must be ${NOODLE_PRIVATE_POST_GUIDE_MAX_LENGTH.toLocaleString()} characters or fewer.`,
      );
      return;
    }
    if (access === "ppv" && (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 999_999)) {
      setGuideError("Enter a PPV price from 0 to 999,999 credits.");
      return;
    }
    try {
      await onGuidedPost(submission());
      clearDraft();
    } catch (error) {
      setGuideError(errorMessage(error, "Could not generate this post."));
    }
  };

  if (collapsible && !expanded) {
    return (
      <div className="border-b border-[var(--noodle-divider)] px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--noodle-divider)] px-3 text-left transition-colors hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]"
          aria-expanded="false"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">Post as {profile.displayName}</span>
            <span className="block text-xs text-[var(--muted-foreground)]">
              {hasDraft ? "Draft saved" : "Write directly or guide the AI"}
            </span>
          </span>
          <Pencil size={16} />
        </button>
      </div>
    );
  }

  return (
    <NoodleComposerShell
      dataComponent="NoodlerHome.PrivatePostComposer"
      header={collapsible ? (
        <button
          type="button"
          onClick={() => {
            setActiveTool(null);
            setExpanded(false);
          }}
          disabled={pending}
          aria-expanded="true"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs font-bold text-[var(--noodle-blue)] hover:bg-[var(--accent)] disabled:opacity-50"
        >
          <ChevronDown size={14} />
          Post as {profile.displayName}
        </button>
      ) : undefined}
      avatar={<ProfileInitial profile={profile} />}
      tools={
        <NoodleComposerToolRow
          image={{ disabled: true }}
          poll={{ disabled: true }}
          media={{
            ref: mediaToolRef,
            active: activeTool === "media",
            disabled: pending,
            onClick: () => toggleTool("media"),
          }}
          trailing={
            <div ref={coinToolRef} className="relative">
              <NoodleToolButton
                title="Post visibility and price"
                active={activeTool === "coin" || access !== "public"}
                disabled={pending}
                onClick={() => toggleTool("coin")}
              >
                <Coins size={18} />
              </NoodleToolButton>
            </div>
          }
        />
      }
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void guidePost()}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--noodle-divider)] px-3 text-xs font-bold hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guidePending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {guidePending ? "Guiding…" : "Guide"}
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            disabled={pending || !body.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 [&_svg]:!text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {manualPending
              ? <Loader2 size={13} className="animate-spin" />
              : <Send size={13} />}
            {manualPending ? "Posting…" : "Post"}
          </button>
        </div>
      }
      popovers={
        <>
          {activeTool === "media" && (
            <NoodleAnchoredPopover anchorRef={mediaToolRef} wide>
              <ConversationMediaPickerPanel
                tabs={[{ id: "emoji", label: "Emoji" }]}
                activeTab={mediaPickerTab}
                onActiveTabChange={setMediaPickerTab}
                onClose={() => setActiveTool(null)}
                onEmojiSelect={(emoji) => onDraftChange({ body: body + emoji })}
                onGifSelect={() => {}}
                onStickerSelect={(name) => onDraftChange({ body: `${body}sticker:${name}:` })}
                className="w-full !border-[var(--marinara-chat-chrome-panel-border)] !bg-[var(--background)] !text-[var(--foreground)] shadow-2xl shadow-black/35"
              />
            </NoodleAnchoredPopover>
          )}
          {activeTool === "coin" && (
            <NoodleAnchoredPopover anchorRef={coinToolRef}>
              <div className="marinara-chat-popover space-y-3 rounded-xl border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] p-3 text-[var(--foreground)] shadow-2xl shadow-black/35">
                <p className="text-xs font-bold">Who can see this post</p>
                <div className="grid grid-cols-3 gap-1 rounded-md bg-[var(--accent)] p-1">
                  {(["public", "subscriber", "ppv"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={access === option}
                      onClick={() => onDraftChange({ access: option })}
                      className={cn(
                        "min-h-8 rounded px-2 text-xs font-bold capitalize",
                        access === option
                          ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                      )}
                    >
                      {option === "subscriber" ? "Subscribers" : option.toUpperCase()}
                    </button>
                  ))}
                </div>
                {access === "ppv" && (
                  <label className="block space-y-1">
                    <span className="text-[0.68rem] font-semibold uppercase tracking-normal text-[var(--marinara-chat-chrome-panel-muted)]">
                      Unlock price (credits)
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="999999"
                      step="0.01"
                      value={ppvPrice}
                      onChange={(event) => onDraftChange({ ppvPrice: event.target.value })}
                      aria-label="PPV price"
                      className="mari-chrome-field h-9 w-full rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--noodle-blue)]"
                    />
                  </label>
                )}
              </div>
            </NoodleAnchoredPopover>
          )}
        </>
      }
      footer={(postError || guideError) && (
        <div className="mt-2 space-y-1 pl-14 text-xs text-[var(--destructive)]" role="alert">
          {postError && <p>Post: {postError}</p>}
          {guideError && <p>Guide: {guideError}</p>}
        </div>
      )}
    >
      <label className="block space-y-1">
        <span className="sr-only">Post title (optional)</span>
        <input
          value={title}
          onChange={(event) => onDraftChange({ title: event.target.value })}
          maxLength={NOODLE_PRIVATE_POST_TITLE_MAX_LENGTH}
          disabled={pending}
          placeholder="Title (optional)"
          className="h-9 w-full border-0 bg-transparent text-base font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
        />
      </label>
      <textarea
        value={body}
        onChange={(event) => onDraftChange({ body: event.target.value })}
        maxLength={NOODLE_PRIVATE_POST_CONTENT_MAX_LENGTH}
        disabled={pending}
        aria-label="Post body"
        placeholder="What's simmering, privately?"
        className="min-h-20 w-full resize-none border-0 bg-transparent py-2 text-[1rem] leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
      />
    </NoodleComposerShell>
  );
}

// Creator subscribe/unsubscribe suggestions for desktop layouts.
function SubscriptionSections({
  creators,
  onToggleSubscription,
  togglePending,
}: {
  creators: NonNullable<ReturnType<typeof useNoodlerViewer>["data"]>["creators"];
  onToggleSubscription: (creatorAccountId: string, subscribed: boolean) => void;
  togglePending: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--noodle-divider)] bg-[var(--background)]">
      <div className="border-b border-[var(--noodle-divider)] px-4 py-3">
        <h3 className="text-lg font-bold">Creators</h3>
      </div>
      {creators.length > 0 ? (
        <div className="divide-y divide-[var(--noodle-divider)]">
          {creators.map((creator) => (
            <div key={creator.profile.id} className="flex items-center gap-3 px-4 py-3">
              <ProfileInitial profile={creator.profile} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{creator.profile.displayName}</span>
                <span className="block truncate text-xs text-[var(--muted-foreground)]">@{creator.profile.handle}</span>
              </span>
              <button
                type="button"
                disabled={togglePending}
                onClick={() => onToggleSubscription(creator.profile.id, creator.subscribed)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
                  creator.subscribed
                    ? "border border-[var(--noodle-divider)] text-[var(--foreground)]"
                    : "bg-[var(--foreground)] text-[var(--background)] [&_svg]:!text-[var(--background)]",
                )}
              >
                {creator.subscribed ? <Minus size={14} /> : <Plus size={14} />}
                {creator.subscribed ? "Unsubscribe" : "Subscribe"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-[var(--muted-foreground)]">No creators are visible to this persona yet.</p>
      )}
    </section>
  );
}

function ProfileInitial({
  profile,
  large = false,
}: {
  profile: Pick<NoodlerStageProfile, "displayName">;
  large?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--noodle-blue)]/15 font-black text-[var(--noodle-blue)] ${large ? "h-16 w-16 text-xl" : "h-11 w-11"}`}
    >
      {Array.from(profile.displayName)[0]?.toUpperCase() || <UserRound size={20} />}
    </span>
  );
}

function DisclosureBadge({ mode }: { mode: NoodleIdentityDisclosure | null }) {
  const label = mode ? DISCLOSURE_OPTIONS.find((option) => option.value === mode)?.shortLabel : "Setup needed";
  return (
    <span className="rounded-full border border-[var(--noodle-divider)] px-2 py-0.5 text-[0.68rem] font-bold capitalize text-[var(--muted-foreground)]">
      {label}
    </span>
  );
}

function EmptyState({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="px-8 py-8 text-center sm:py-16">
      <UserRound size={36} className="mx-auto text-[var(--noodle-blue)]" />
      <p className="mt-4 font-bold">{title}</p>
      {detail && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">{detail}</p>}
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 h-9 rounded-md border border-[var(--noodle-divider)] px-4 text-xs font-bold hover:bg-[var(--accent)]"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function NoodlerFrame({
  children,
  onBack,
  title,
  hideBack = false,
  action,
}: {
  children: ReactNode;
  onBack: () => void;
  title: string;
  hideBack?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--noodle-divider)] px-2">
        {!hideBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--noodle-blue)] hover:bg-[var(--noodle-blue)]/10"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
        {action}
        <span className="rounded-full bg-[var(--noodle-blue)]/10 px-2.5 py-1 text-[0.65rem] font-bold text-[var(--noodle-blue)]">
          Private
        </span>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
