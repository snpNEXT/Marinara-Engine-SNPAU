// ──────────────────────────────────────────────
// Routes: Noodle Fake Social Media
// ──────────────────────────────────────────────
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { extname } from "node:path";
import { z } from "zod";
import {
  createNoodlePoll,
  canManageNoodleReply,
  extractNoodleMentionHandles,
  noodleAccountFollowUpdateSchema,
  noodleAccountProfileUpdateSchema,
  noodleAccountSettingsPatchSchema,
  noodleAutoPostRescheduleSchema,
  noodleAccountUpdateSchema,
  noodleBulkInviteSchema,
  noodleBulkNoodlerAccountCreateSchema,
  noodleCreateInteractionSchema,
  noodleCreatePostSchema,
  noodleInviteSchema,
  noodleInteractionOwnerSchema,
  noodleInteractionUpdateSchema,
  noodlePostUpdateSchema,
  noodlerPostCreateSchema,
  noodlerPostCreateWithMediaSchema,
  noodlerGenerationRequestSchema,
  noodlerPostUpdateSchema,
  noodlerAccountCreateSchema,
  noodlerCreateInteractionSchema,
  noodlerRemoveInteractionSchema,
  noodlerSubscriptionSchema,
  noodlerUnlockSchema,
  noodlerViewerPersonaSchema,
  noodleRemoveInteractionSchema,
  noodleRescheduleRefreshSchema,
  noodleGenerationRequestSchema,
  noodleNudgeSchema,
  noodleSettingsUpdateSchema,
  PROFESSOR_MARI_ID,
  getActiveStatusOverride,
  getEffectiveCurrentStatus,
  resolveProviderReasoningEffort,
  noodleStageProfileUpdateSchema,
  noodleStageProfileDraftRequestSchema,
  readNoodlePollFromMetadata,
  resolveMacros,
  type APIProvider,
  type NoodleAccount,
  type NoodleAccountProfileSettings,
  type NoodleBootstrap,
  type NoodleInteraction,
  type NoodleInteractionType,
  type NoodlePost,
  type NoodleRefreshAttemptKind,
  type NoodleSettings,
  type WeekSchedule,
  type NoodlerSubscriber,
  type NoodlerPostView,
} from "@marinara-engine/shared";
import type { ChatMessage } from "../services/llm/base-provider.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createConnectionsStorage } from "../services/storage/connections.storage.js";
import { createGalleryStorage } from "../services/storage/gallery.storage.js";
import { createCharacterGalleryStorage } from "../services/storage/character-gallery.storage.js";
import { createNoodleStorage, parseNoodleAvatarCrop } from "../services/storage/noodle.storage.js";
import { createPromptOverridesStorage } from "../services/storage/prompt-overrides.storage.js";
import { createLLMProvider } from "../services/llm/provider-registry.js";
import { withConnectionFallbackProvider } from "../services/llm/connection-fallback-provider.js";
import { generateImage, saveImageToDisk } from "../services/image/image-generation.js";
import { resolveConnectionImageDefaults } from "../services/image/image-generation-defaults.js";
import { loadImageGenerationUserSettings } from "../services/image/image-generation-settings.js";
import { compileImagePrompt } from "../services/image/image-prompt-compiler.js";
import { resolveImagePromptReviewSize } from "../services/image/image-prompt-review.js";
import {
  loadPrompt,
  NOODLE_IMAGE_POST,
  NOODLE_TIMELINE_BASE,
  NOODLE_TIMELINE_VOICE,
} from "../services/prompt-overrides/index.js";
import { parseGameJsonish } from "../services/game/jsonish.js";
import { resolveIllustratorCharacterReferences } from "./generate/illustrator-references.js";
import { resolveBaseUrl } from "./generate/generate-route-utils.js";
import { logger, logDebugOverride } from "../lib/logger.js";
import { clampGenerationMaxOutputTokens } from "../services/generation/output-token-limits.js";
import { resolveImageConnectionFallback } from "../services/generation/media-connection-fallback.js";
import {
  noodleRefreshSchedulerStatus,
  rescheduleNoodleRefreshTime,
  localScheduleTimezone,
} from "../services/noodle/noodle-refresh-schedule.js";
import { NOODLE_JSON_OUTPUT_HEADING, noodleResponseFormat } from "../services/noodle/noodle-response-format.js";
import { generateNoodleImageWithRetry } from "../services/noodle/noodle-image-retry.js";
import { isFileUniqueConstraintError } from "../db/file-schema.js";
import { resolveImageCaptioningRuntime } from "./generate/image-captioning-runtime.js";
import { resolveNoodleAvatarCropAfterProfileUpdate } from "../services/noodle/noodle-profile-avatar.js";
import { isAllowedImageBuffer, safeFetch } from "../utils/security.js";

import { stageProfileContainsPublicIdentity } from "../services/noodle/noodle-noodler-generation.service.js";
import {
  createNoodlerPost,
  generateAndApplyNoodlerPost,
  refreshAllNoodlerCreatorsNow,
  updateNoodlerPostWithMedia,
} from "../services/noodle/noodle-noodler-post.operation.js";
import { tryNoodlerAccountOperation } from "../services/noodle/noodle-noodler-account-operation-lock.js";
import { generateNoodlerStageProfileDraft } from "../services/noodle/noodle-stage-profile-draft.service.js";
import { canViewNoodlerPost, isNoodlerHiddenFromViewer } from "../services/noodle/noodler-access.js";
import { createNoodlerNoodleImagesService } from "../services/noodle/noodle-noodler-images.service.js";
import {
  readNoodlerMediaPath,
  removeNoodlerAccountMedia,
  resolveNoodlerMediaAbsolutePath,
  type NoodlerPostMediaUpload,
  unlinkNoodlerMedia,
} from "../services/noodle/noodle-noodler-media.js";
import {
  canGenerateNoodleActivityForAccountKind,
  collectNoodlePromptImageCandidates,
  composeNoodleTimelineSystemPrompt,
  formatNoodleTimelineForPrompt,
  noodleLorebookTokenBudget,
  noodlePastMemoryCutoff,
  noodlePastMemorySampleSize,
  noodlePersonaCommentPostIds,
  NOODLE_ADULT_PLATFORM_POLICY,
  NOODLE_LEGACY_PAST_MEMORY_INCLUSION_CHANCE,
  NOODLE_LEGACY_PAST_MEMORY_MAX_ITEMS,
  NOODLE_LEGACY_RECALLED_MEMORY_INSTRUCTION,
  NOODLE_PERSONA_IDENTITY_INSTRUCTION,
  NOODLE_RECALLED_MEMORY_INSTRUCTION,
  noodleTimelineFeatureInstructions,
  sampleNoodlePastMemories,
  sampleNoodlePastMemoriesWeighted,
} from "../services/noodle/noodle-prompt.js";
import { processLorebooks } from "../services/lorebook/index.js";
import { buildPromptMacroContext, resolveMacrosWithVariableSnapshot } from "../services/prompt/index.js";
import type { DB } from "../db/connection.js";
import {
  generateImageCaptionForDataUrl,
  type ImageCaptioningRuntime,
} from "./generate/image-captioning-runtime.js";
import {
  formatNoodleVisionManifest,
  isUnsupportedNoodleVisionInputError,
  prepareNoodleVisionAttachments,
  type NoodleVisionAttachment,
} from "../services/noodle/noodle-vision.js";
import { chooseNoodleParticipantAccounts } from "../services/noodle/noodle-participant-selection.js";
import { canCreateGeneratedNoodleInteraction } from "../services/noodle/noodle-interaction-policy.js";
import { parseNoodleGeneratedProfiles } from "../services/noodle/noodle-generated-profiles.js";
import {
  getEnabledConversationSchedules,
  parseConversationStatusOverrides,
} from "../services/generation/conversation-context-utils.js";
import {
  parseNoodleGeneratedRefresh,
  parseNoodleGeneratedRefreshResponse,
  validateNoodleGeneratedRefresh,
} from "../services/noodle/noodle-generated-refresh.js";
import { normalizeNoodleImagePrompt } from "../services/noodle/noodle-image-prompt.js";
import { normalizeNoodleHandle } from "../services/noodle/noodle-handle.js";
import {
  isNoodleProfileGenerated,
  noodleAccountsNeedingProfiles,
} from "../services/noodle/noodle-profile-selection.js";

const NOODLE_ROUTE_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_PUBLIC_DIR = resolve(NOODLE_ROUTE_DIR, "../../../client/public");
const PROFESSOR_MARI_REFERENCE_ASSETS = [
  "sprites/mari/Mari_profile.png",
  "sprites/mari/chibi-professor-mari.png",
] as const;

function readProfessorMariReferenceImages(): string[] {
  return PROFESSOR_MARI_REFERENCE_ASSETS.flatMap((relativePath) => {
    const filePath = resolve(CLIENT_PUBLIC_DIR, relativePath);
    if (!existsSync(filePath)) return [];
    try {
      return [readFileSync(filePath).toString("base64")];
    } catch {
      return [];
    }
  });
}

function characterAvatarCrop(row: { data: unknown }) {
  return parseNoodleAvatarCrop(parseRecord(parseRecord(row.data).extensions).avatarCrop);
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseStringArray(value: unknown): string[] {
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

function escapePromptAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Reads the chat's already-derived `conversationCharacterStatuses` (updated on each generation in
 * that chat), keyed by characterId. This is a plain metadata read, not a schedule recomputation —
 * cheap enough to attach to every opted-in chat_context block without a separate token budget.
 */
function parseConversationCharacterStatuses(metadata: unknown): Record<string, { status: string; activity: string }> {
  const raw = parseRecord(metadata).conversationCharacterStatuses;
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, { status: string; activity: string }> = {};
  for (const [characterId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const status = (value as Record<string, unknown>).status;
    const activity = (value as Record<string, unknown>).activity;
    if (typeof status === "string" && typeof activity === "string") {
      result[characterId] = { status, activity };
    }
  }
  return result;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sinceHoursIso(hours: number) {
  return new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000).toISOString();
}

function characterNameFromRow(row: { data: unknown } | null | undefined) {
  const data = parseRecord(row?.data);
  return typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Character";
}

function personaNameFromRow(row: { name?: string | null; convoDisplayName?: string | null } | null | undefined) {
  return row?.convoDisplayName?.trim() || row?.name?.trim() || "User";
}

function characterContextFromRow(row: { id: string; data: unknown; avatarPath?: string | null }) {
  const data = parseRecord(row.data);
  const extensions = parseRecord(data.extensions);
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Character";
  const lines = [`<character name="${escapePromptAttribute(name)}">`];
  for (const [label, value] of [
    ["Description", data.description],
    ["Personality", data.personality],
    ["Scenario", data.scenario],
    ["First message", data.first_mes],
    ["Appearance", data.appearance ?? extensions.appearance],
    ["Backstory", data.backstory ?? extensions.backstory],
  ] as const) {
    if (typeof value === "string" && value.trim()) lines.push(`${label}: ${value.trim()}`);
  }
  lines.push(`</character>`);
  return lines.join("\n");
}

function personaContextFromRow(row: {
  id: string;
  name: string;
  convoDisplayName?: string | null;
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  backstory?: string | null;
  appearance?: string | null;
}) {
  const displayName = row.convoDisplayName?.trim() || row.name || "User";
  const lines = [
    `<persona id="${escapePromptAttribute(row.id)}" accountKey="persona:${escapePromptAttribute(row.id)}" name="${escapePromptAttribute(displayName)}">`,
  ];
  for (const [label, value] of [
    ["Description", row.description],
    ["Personality", row.personality],
    ["Scenario", row.scenario],
    ["Backstory", row.backstory],
    ["Appearance", row.appearance],
  ] as const) {
    if (typeof value === "string" && value.trim()) lines.push(`${label}: ${value.trim()}`);
  }
  lines.push(`</persona>`);
  return lines.join("\n");
}

function characterAppearanceFromRow(row: { data: unknown }) {
  const data = parseRecord(row.data);
  const extensions = parseRecord(data.extensions);
  const value = data.appearance ?? extensions.appearance ?? data.description;
  return typeof value === "string" ? value.trim() : "";
}

function galleryImageUrl(filePath: string, fallbackChatId: string) {
  const filename = basename(filePath.replace(/\\/g, "/"));
  return `/api/gallery/file/${encodeURIComponent(fallbackChatId)}/${encodeURIComponent(filename)}`;
}

function characterGalleryImageUrl(characterId: string, filePath: string) {
  const filename = basename(filePath.replace(/\\/g, "/"));
  return `/api/characters/${encodeURIComponent(characterId)}/gallery/file/${encodeURIComponent(filename)}`;
}

function mentionedCharacterAccounts(accounts: NoodleAccount[], content: string): NoodleAccount[] {
  const mentionedHandles = new Set(extractNoodleMentionHandles(content));
  if (mentionedHandles.size === 0) return [];
  return accounts.filter(
    (account) => account.kind === "character" && mentionedHandles.has(account.handle.toLowerCase()),
  );
}

function mentionedAccountMetadata(accounts: NoodleAccount[]) {
  return {
    mentionedAccountIds: accounts.map((account) => account.id),
    mentionedEntityIds: accounts.map((account) => account.entityId),
  };
}

function generatedProfileSettings(location: string, bannerUrl: string | null): NoodleAccountProfileSettings {
  return {
    profileGenerated: true,
    location,
    bannerUrl: bannerUrl ?? "",
  };
}

function profileSetupMaxTokens(characterCount: number) {
  return 1024 + Math.max(0, characterCount) * 1024;
}

function timelineRefreshMaxTokens(characterCount: number) {
  return 4096 + Math.max(0, characterCount) * 1024;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}

const RANDOM_NOODLE_USERS = [
  {
    entityId: "random_user:thread-countess",
    displayName: "Thread Countess",
    bio: "Chronically online textile hobbyist who treats every Noodle argument like court gossip.",
  },
  {
    entityId: "random_user:packet-soup",
    displayName: "Packet Soup",
    bio: "Friendly lurker, recipe collector, and accidental drama amplifier.",
  },
  {
    entityId: "random_user:orbit-notice",
    displayName: "Orbit Notice",
    bio: "Posts vague observations, likes too quickly, and follows anyone with interesting chaos.",
  },
  {
    entityId: "random_user:glass-bulletin",
    displayName: "Glass Bulletin",
    bio: "Local rumor account with polished manners and questionable sources.",
  },
  {
    entityId: "random_user:moth-hour",
    displayName: "Moth Hour",
    bio: "Night-scroller who replies with eerie encouragement and niche memes.",
  },
  {
    entityId: "random_user:brine-index",
    displayName: "Brine Index",
    bio: "Overconfident commentator who keeps a spreadsheet of everyone else's scandals.",
  },
] as const;

const PROFESSOR_MARI_NOODLE_BIO =
  "She/Her | 18+ | Skill Issue | Your Assistant After Hours (hey, I get to do fun stuff, too!) | Simp for Il Dottore 24/7 | LLMs Fan";

export function collectNoodlePriorityAccountIds(input: {
  accounts: NoodleAccount[];
  posts: NoodlePost[];
  interactions: NoodleInteraction[];
  personaAccount: NoodleAccount | null;
}): Set<string> {
  const priority = new Set<string>();
  if (!input.personaAccount) return priority;
  const accountByHandle = new Map(input.accounts.map((account) => [account.handle.toLowerCase(), account]));
  const interactionById = new Map(input.interactions.map((interaction) => [interaction.id, interaction]));
  const addMentionedAccounts = (content: string | null | undefined) => {
    for (const handle of extractNoodleMentionHandles(content ?? "")) {
      const account = accountByHandle.get(handle);
      if (account && account.kind !== "persona") priority.add(account.id);
    }
  };

  for (const post of input.posts) {
    if (post.authorAccountId === input.personaAccount.id) addMentionedAccounts(post.content);
  }
  for (const interaction of input.interactions) {
    if (interaction.actorAccountId === input.personaAccount.id) {
      addMentionedAccounts(interaction.content);
      const post = input.posts.find((candidate) => candidate.id === interaction.postId);
      if (post && post.authorAccountId !== input.personaAccount.id) priority.add(post.authorAccountId);
      const parent = interaction.parentInteractionId ? interactionById.get(interaction.parentInteractionId) : null;
      if (parent && parent.actorAccountId !== input.personaAccount.id) priority.add(parent.actorAccountId);
      continue;
    }
    if (extractNoodleMentionHandles(interaction.content ?? "").includes(input.personaAccount.handle.toLowerCase())) {
      priority.add(interaction.actorAccountId);
    }
  }
  return priority;
}

async function pickGalleryAttachmentForAccount(input: {
  account: NoodleAccount;
  chats: ReturnType<typeof createChatsStorage>;
  gallery: ReturnType<typeof createGalleryStorage>;
  characterGallery: ReturnType<typeof createCharacterGalleryStorage>;
}) {
  if (input.account.kind !== "character") return null;

  const characterImages = await input.characterGallery.listByCharacterId(input.account.entityId);
  const characterImage = characterImages[0];
  if (characterImage) {
    return {
      imageUrl: characterGalleryImageUrl(input.account.entityId, characterImage.filePath),
      metadata: {
        galleryAttachmentSource: "character-gallery",
        galleryAttachmentId: characterImage.id,
      },
    };
  }

  const chats = await input.chats.list();
  const chatIds = chats
    .filter((chat) => parseStringArray(chat.characterIds).includes(input.account.entityId))
    .map((chat) => chat.id)
    .slice(0, 20);
  const chatImages = await input.gallery.listByChatIds(chatIds);
  const chatImage = chatImages[0];
  if (!chatImage) return null;
  return {
    imageUrl: galleryImageUrl(chatImage.filePath, chatImage.chatId),
    metadata: {
      galleryAttachmentSource: "chat-gallery",
      galleryAttachmentId: chatImage.id,
      galleryAttachmentChatId: chatImage.chatId,
    },
  };
}

async function pickRandomCharacterBannerUrl(
  characterGallery: ReturnType<typeof createCharacterGalleryStorage>,
  characterId: string,
) {
  const images = await characterGallery.listByCharacterId(characterId);
  const image = images.length > 0 ? shuffle(images)[0] : null;
  return image ? characterGalleryImageUrl(characterId, image.filePath) : null;
}

async function ensureRandomUserAccounts(noodle: ReturnType<typeof createNoodleStorage>) {
  for (const profile of RANDOM_NOODLE_USERS) {
    await noodle.upsertAccountFromProfile({
      kind: "random_user",
      entityId: profile.entityId,
      displayName: profile.displayName,
      bio: profile.bio,
      invited: true,
    });
  }
}

async function ensureProfessorMariAccount(
  noodle: ReturnType<typeof createNoodleStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
) {
  const row = await characters.getById(PROFESSOR_MARI_ID);
  const account = await noodle.upsertAccountFromProfile({
    kind: "character",
    entityId: PROFESSOR_MARI_ID,
    displayName: row ? characterNameFromRow(row) : "Professor Mari",
    avatarUrl: row?.avatarPath ?? "/sprites/mari/Mari_profile.png",
    avatarCrop: row ? characterAvatarCrop(row) : null,
    bio: PROFESSOR_MARI_NOODLE_BIO,
    invited: true,
    syncIdentity: true,
  });
  if (
    account.settings.profile.profileManuallyEdited !== true &&
    (account.bio !== PROFESSOR_MARI_NOODLE_BIO ||
      !isNoodleProfileGenerated(account) ||
      !account.settings.profile.location)
  ) {
    await noodle.updateAccountProfile(account.id, {
      handle: account.handle || "professor_mari",
      displayName: account.displayName || "Professor Mari",
      bio: PROFESSOR_MARI_NOODLE_BIO,
      avatarUrl: account.avatarUrl || row?.avatarPath || "/sprites/mari/Mari_profile.png",
      profile: generatedProfileSettings("Marinara Engine", null),
    });
  }
}

async function ensureSelectedGroupCharacterAccounts(
  noodle: ReturnType<typeof createNoodleStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
  groupIds: string[],
) {
  const selectedGroupIds = new Set(groupIds);
  if (selectedGroupIds.size === 0) return new Set<string>();
  const groups = await characters.listGroups();
  const selectedCharacterIds = new Set<string>();
  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue;
    for (const characterId of parseStringArray(group.characterIds)) selectedCharacterIds.add(characterId);
  }

  for (const characterId of selectedCharacterIds) {
    const row = await characters.getById(characterId);
    if (!row) continue;
    await noodle.upsertAccountFromProfile({
      kind: "character",
      entityId: row.id,
      displayName: characterNameFromRow(row),
      avatarUrl: row.avatarPath ?? null,
      avatarCrop: characterAvatarCrop(row),
      bio: String(parseRecord(row.data).description ?? ""),
      syncIdentity: true,
    });
  }
  return selectedCharacterIds;
}

async function ensurePersonaAccounts(
  noodle: ReturnType<typeof createNoodleStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
) {
  const personas = await characters.listPersonas();
  const livePersonaIds = new Set<string>();
  for (const persona of personas) {
    livePersonaIds.add(persona.id);
    await noodle.upsertAccountFromProfile({
      kind: "persona",
      entityId: persona.id,
      displayName: persona.convoDisplayName || persona.name || "User",
      avatarUrl: persona.avatarPath ?? null,
      avatarCrop: parseNoodleAvatarCrop(persona.avatarCrop),
      bio: persona.aboutMe || persona.description || "",
      invited: true,
    });
  }
  return livePersonaIds;
}

function filterStalePersonaAccounts(bootstrap: NoodleBootstrap, livePersonaIds: Set<string>): NoodleBootstrap {
  return {
    ...bootstrap,
    accounts: bootstrap.accounts.filter(
      (account) => account.kind !== "persona" || livePersonaIds.has(account.entityId),
    ),
  };
}

function filterExcludedNoodleAccounts(bootstrap: NoodleBootstrap, settings: NoodleSettings): NoodleBootstrap {
  if (settings.allowProfessorMari) return bootstrap;
  return {
    ...bootstrap,
    accounts: bootstrap.accounts.filter(
      (account) => account.kind !== "character" || account.entityId !== PROFESSOR_MARI_ID,
    ),
  };
}

async function bootstrapVisibleNoodle(
  noodle: ReturnType<typeof createNoodleStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
) {
  const settings = await noodle.getSettings();
  const livePersonaIds = await ensurePersonaAccounts(noodle, characters);
  if (settings.allowProfessorMari) await ensureProfessorMariAccount(noodle, characters);
  const existingCharacterAccounts = (await noodle.listAccounts()).filter(
    (account) => account.kind === "character" && account.entityId !== PROFESSOR_MARI_ID,
  );
  const characterRowsById = new Map((await characters.list()).map((row) => [row.id, row]));
  for (const account of existingCharacterAccounts) {
    const row = characterRowsById.get(account.entityId);
    if (!row) continue;
    await noodle.upsertAccountFromProfile({
      kind: "character",
      entityId: row.id,
      displayName: characterNameFromRow(row),
      avatarUrl: row.avatarPath ?? null,
      avatarCrop: characterAvatarCrop(row),
      syncIdentity: true,
    });
  }
  return filterExcludedNoodleAccounts(filterStalePersonaAccounts(await noodle.bootstrap(), livePersonaIds), settings);
}

async function resolvePersonaAccount(
  noodle: ReturnType<typeof createNoodleStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
  personaId?: string,
) {
  const personas = await characters.listPersonas();
  const persona =
    personas.find((p) => p.id === personaId) ?? personas.find((p) => p.isActive === "true") ?? personas[0];
  if (!persona) return null;
  return noodle.upsertAccountFromProfile({
    kind: "persona",
    entityId: persona.id,
    displayName: persona.convoDisplayName || persona.name || "User",
    avatarUrl: persona.avatarPath ?? null,
    avatarCrop: parseNoodleAvatarCrop(persona.avatarCrop),
    bio: persona.aboutMe || persona.description || "",
    invited: true,
  });
}

const NOODLE_CHAT_CONTEXT_MESSAGE_LIMIT = 8;
const NOODLE_CHAT_CONTEXT_CHAT_LIMIT = 8;

async function resolveCharacterName(
  characters: ReturnType<typeof createCharactersStorage>,
  characterId: string,
  cache: Map<string, string>,
) {
  const cached = cache.get(characterId);
  if (cached) return cached;
  const row = await characters.getById(characterId);
  const name = characterNameFromRow(row);
  cache.set(characterId, name);
  return name;
}

async function resolvePersonaName(
  characters: ReturnType<typeof createCharactersStorage>,
  personaId: string | null | undefined,
  cache: Map<string, string>,
) {
  if (!personaId) return "User";
  const cached = cache.get(personaId);
  if (cached) return cached;
  const row = await characters.getPersona(personaId);
  const name = personaNameFromRow(row);
  cache.set(personaId, name);
  return name;
}

function messageRoleLabel(role: string) {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "narrator") return "narrator";
  return "system";
}

async function buildOptedInChatContext(
  chats: ReturnType<typeof createChatsStorage>,
  characters: ReturnType<typeof createCharactersStorage>,
  selectedCharacterIds: string[],
  includeCharacterStatuses: boolean,
) {
  if (selectedCharacterIds.length === 0) return "No selected character chats are eligible for Noodle context.";
  const selected = new Set(selectedCharacterIds);
  const allChats = await chats.list();
  const relevant = allChats
    .filter((chat) => parseRecord(chat.metadata).noodleTimelineContextEnabled === true)
    .filter((chat) => parseStringArray(chat.characterIds).some((characterId) => selected.has(characterId)))
    .slice(0, NOODLE_CHAT_CONTEXT_CHAT_LIMIT);
  const blocks: string[] = [];
  const characterNameCache = new Map<string, string>();
  const personaNameCache = new Map<string, string>();
  const now = new Date();
  for (const chat of relevant) {
    const chatMeta = parseRecord(chat.metadata);
    const chatCharacterIds = parseStringArray(chat.characterIds);
    const [personaName, characterNames, messages] = await Promise.all([
      resolvePersonaName(characters, chat.personaId, personaNameCache),
      Promise.all(
        chatCharacterIds.map(async (characterId) => ({
          id: characterId,
          name: await resolveCharacterName(characters, characterId, characterNameCache),
        })),
      ),
      chats.listMessagesPaginated(chat.id, NOODLE_CHAT_CONTEXT_MESSAGE_LIMIT),
    ]);
    if (messages.length === 0) continue;
    const speakerNameByCharacterId = new Map(characterNames.map((character) => [character.id, character.name]));
    const schedules = getEnabledConversationSchedules(chatMeta) as Record<string, WeekSchedule>;
    const statusOverrides = parseConversationStatusOverrides(chatMeta.conversationStatusOverrides);
    const statusSnapshots = parseRecord(chatMeta.conversationCharacterStatuses);
    const participantLines = [
      `- User persona: ${personaName}`,
      ...characterNames.map((character) => {
        if (!includeCharacterStatuses) return `- Character: ${character.name}`;
        const schedule = schedules[character.id];
        const override = statusOverrides[character.id];
        const snapshot = parseRecord(statusSnapshots[character.id]);
        const liveStatus =
          getActiveStatusOverride(override, now) || schedule
            ? getEffectiveCurrentStatus(schedule, override, now)
            : null;
        const status =
          liveStatus?.status ?? (typeof snapshot.status === "string" && snapshot.status.trim() ? snapshot.status : "online");
        const activity =
          liveStatus?.activity ??
          (typeof snapshot.activity === "string" && snapshot.activity.trim() ? snapshot.activity : "free time");
        return `- Character: ${character.name} (currentStatus=${status}, currentActivity=${activity})`;
      }),
    ];
    // Attach each character's current status/activity from this chat's own schedule, if this chat
    // has one. Read-only metadata lookup already updated by that chat's own generation — no new
    // schedule computation and no attempt to reconcile a character's status across multiple chats;
    // each opted-in chat's status stays scoped to its own <chat_context> block, same as messages.
    const characterStatuses = parseConversationCharacterStatuses(chat.metadata);
    const statusLines = characterNames
      .map((character) => {
        const status = characterStatuses[character.id];
        return status ? `- ${character.name}: currently ${status.status} (${status.activity})` : null;
      })
      .filter((line): line is string => Boolean(line));
    const messageLines = await Promise.all(
      messages.map(async (message) => {
        const role = messageRoleLabel(message.role);
        let speaker = role === "user" ? personaName : role === "narrator" ? "Narrator" : "Assistant";
        if (message.characterId) {
          speaker =
            speakerNameByCharacterId.get(message.characterId) ??
            (await resolveCharacterName(characters, message.characterId, characterNameCache));
        }
        const content = String(message.content ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 900);
        return `- ${speaker} (${role}): ${content}`;
      }),
    );
    blocks.push(
      [
        `<chat_context id="${escapePromptAttribute(chat.id)}" mode="${escapePromptAttribute(
          chat.mode,
        )}" name="${escapePromptAttribute(chat.name)}">`,
        "Participants:",
        ...participantLines,
    ...(statusLines.length > 0 && includeCharacterStatuses ? ["Current status in this story:", ...statusLines] : []),
        "Recent messages:",
        ...messageLines,
        `</chat_context>`,
      ].join("\n"),
    );
  }
  return blocks.length > 0
    ? blocks.join("\n\n")
    : "No opted-in chats with recent messages for the selected characters.";
}

async function buildRefreshPrompt(input: {
  db: DB;
  noodle: ReturnType<typeof createNoodleStorage>;
  characters: ReturnType<typeof createCharactersStorage>;
  chats: ReturnType<typeof createChatsStorage>;
  promptOverrides: ReturnType<typeof createPromptOverridesStorage>;
  activeAccounts: NoodleAccount[];
  personaAccount: NoodleAccount | null;
  settings: NoodleSettings;
  imageCaptioning: ImageCaptioningRuntime;
}) {
  const activeCharacters = input.activeAccounts.filter((account) => account.kind === "character");
  const activeRandomUsers = input.activeAccounts.filter((account) => account.kind === "random_user");
  const selectedCharacterIds = activeCharacters.map((account) => account.entityId);
  const characterRows = await Promise.all(selectedCharacterIds.map((id) => input.characters.getById(id)));
  const personaRow = input.personaAccount ? await input.characters.getPersona(input.personaAccount.entityId) : null;
  const recentCutoff = sinceHoursIso(48);
  const [recentCreatedPosts, recentPersonaComments] = await Promise.all([
    input.noodle.listPosts({ since: recentCutoff, limit: 100 }),
    input.personaAccount
      ? input.noodle.listRepliesByActorSince(input.personaAccount.id, recentCutoff, 100)
      : Promise.resolve([]),
  ]);
  const recentlyCommentedPostIds = noodlePersonaCommentPostIds(recentPersonaComments, input.personaAccount?.id);
  const recentlyCommentedPosts = (
    await Promise.all(recentlyCommentedPostIds.map((postId) => input.noodle.getPostById(postId)))
  ).filter((post): post is NoodlePost => Boolean(post));
  const recentPostById = new Map([...recentCreatedPosts, ...recentlyCommentedPosts].map((post) => [post.id, post]));
  const recentPosts = [...recentPostById.values()].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const enhancedTimelineWriting = input.settings.enableEnhancedTimelineWriting;
  const pastMemorySampleSize = enhancedTimelineWriting
    ? noodlePastMemorySampleSize()
    : noodlePastMemorySampleSize(Math.random, NOODLE_LEGACY_PAST_MEMORY_INCLUSION_CHANCE, NOODLE_LEGACY_PAST_MEMORY_MAX_ITEMS);
  const olderPosts =
    pastMemorySampleSize > 0
      ? (await input.noodle.listPostsBefore(noodlePastMemoryCutoff())).filter((post) => !recentPostById.has(post.id))
      : [];
  let recalledPosts: NoodlePost[];
  if (enhancedTimelineWriting) {
    const activeAccountIds = new Set(input.activeAccounts.map((account) => account.id));
    const activeAccountHandles = new Set(
      input.activeAccounts
        .map((account) => account.handle?.toLowerCase())
        .filter((handle): handle is string => Boolean(handle)),
    );
    const recentAuthorIds = new Set(recentPosts.map((post) => post.authorAccountId));
    const recalledPostRelevanceWeight = (post: NoodlePost): number => {
      let weight = 0.25;
      if (activeAccountIds.has(post.authorAccountId)) weight += 2;
      for (const handle of extractNoodleMentionHandles(post.content ?? "")) {
        if (activeAccountHandles.has(handle)) weight += 1;
      }
      if (recentAuthorIds.has(post.authorAccountId)) weight += 1;
      return weight;
    };
    recalledPosts = sampleNoodlePastMemoriesWeighted(olderPosts, pastMemorySampleSize, recalledPostRelevanceWeight);
  } else {
    recalledPosts = sampleNoodlePastMemories(olderPosts, pastMemorySampleSize);
  }
  const [chatContext, recentInteractions, recalledInteractions] = await Promise.all([
    buildOptedInChatContext(
      input.chats,
      input.characters,
      selectedCharacterIds,
      input.settings.includeChatCharacterStatuses,
    ),
    input.noodle.listInteractions(recentPosts.map((post) => post.id)),
    input.noodle.listInteractions(recalledPosts.map((post) => post.id)),
  ]);

  const promptMacroContext = await buildPromptMacroContext({
    db: input.db,
    characterIds: selectedCharacterIds,
    personaName: personaNameFromRow(personaRow),
    personaPhoneticName: personaRow?.phoneticName ?? "",
    personaDescription: personaRow?.description ?? "",
    personaFields: {
      phoneticName: personaRow?.phoneticName ?? "",
      personality: personaRow?.personality ?? "",
      scenario: personaRow?.scenario ?? "",
      backstory: personaRow?.backstory ?? "",
      appearance: personaRow?.appearance ?? "",
    },
    lastGenerationType: "noodle",
  });
  const resolveNoodleMacros = (value: string) => resolveMacros(value, promptMacroContext, { trimResult: false });
  const characterContext = characterRows
    .filter((row): row is NonNullable<typeof row> => !!row)
    .map((row) => resolveNoodleMacros(characterContextFromRow(row)))
    .join("\n\n");
  const randomUserContext = activeRandomUsers
    .map(
      (account) =>
        `<random_user name="${escapePromptAttribute(account.displayName)}" handle="${escapePromptAttribute(account.handle)}">\nBio: ${
          account.bio || "A casual Noodle user."
        }\n</random_user>`,
    )
    .join("\n\n");
  const personaContext = personaRow
    ? resolveNoodleMacros(personaContextFromRow(personaRow))
    : "No user persona is active.";
  const activeAccountList = [...input.activeAccounts, ...(input.personaAccount ? [input.personaAccount] : [])]
    .map(
      (account) =>
        `- ${account.displayName} (@${account.handle}) kind=${account.kind} accountKey=${account.kind}:${account.entityId} generationRole=${
          account.kind === "persona" ? "reference-target-only" : "allowed-author-and-actor"
        }`,
    )
    .join("\n");

  // Reuse the engine's existing multi-character lorebook system (already used by group chats) so
  // character lore/backstory can surface in Noodle refreshes. Off by default (Settings ->
  // Lorebook context) so existing timelines are unaffected until a user opts in. Oldest-first scan
  // messages from recent timeline text give keyword-scoped entries real content to match against;
  // character context is appended last so entries keyed to a character's own traits stay in scan depth.
  const lorebookResult = input.settings.enableLorebookContext
    ? await processLorebooks(
        input.db,
        [
          ...recentPosts
            .slice()
            .reverse()
            .map((post) => ({ role: "user", content: post.content })),
          ...recentInteractions
            .filter((interaction) => interaction.type === "reply" && interaction.content)
            .map((interaction) => ({ role: "user", content: interaction.content ?? "" })),
          ...(characterContext ? [{ role: "user", content: characterContext }] : []),
        ],
        null,
        {
          characterIds: selectedCharacterIds,
          personaId: input.personaAccount?.entityId ?? null,
          tokenBudget: noodleLorebookTokenBudget(activeCharacters.length),
          generationTriggers: ["noodle"],
          previewOnly: true,
          resolveContent: (value) =>
            resolveMacrosWithVariableSnapshot(value, promptMacroContext, { trimResult: false }),
        },
      )
    : null;
  const loreContext = lorebookResult
    ? [lorebookResult.worldInfoBefore, lorebookResult.worldInfoAfter].filter(Boolean).join("\n")
    : "";

  // The base timeline prompt and its voice/tone tail are independently editable. The base prompt
  // includes the complete default adult-platform, persona-authorship, interaction, and JSON rules;
  // the voice text is deliberately appended last so users can tune style without hunting through
  // the structural instructions.
  const [timelineBaseText, timelineVoiceText] = await Promise.all([
    loadPrompt(input.promptOverrides, NOODLE_TIMELINE_BASE, {}),
    loadPrompt(input.promptOverrides, NOODLE_TIMELINE_VOICE, {
      enhanced: String(enhancedTimelineWriting),
      allowRandomUsers: String(input.settings.allowRandomUsers),
    }),
  ]);
  const system = composeNoodleTimelineSystemPrompt(timelineBaseText, timelineVoiceText);
  const timelineFeatureInstructions = noodleTimelineFeatureInstructions(input.settings);

  const visionCandidates = await prepareNoodleVisionAttachments([
    ...collectNoodlePromptImageCandidates(recentPosts, recentInteractions, {
      priorityActorAccountId: input.personaAccount?.id,
    }),
    ...collectNoodlePromptImageCandidates(recalledPosts, recalledInteractions, {
      priorityActorAccountId: input.personaAccount?.id,
    }),
  ]);
  const captionedImages = new Map<string, string>();
  let visionAttachments: NoodleVisionAttachment[] = visionCandidates;
  if (input.imageCaptioning.enabled) {
    const captionResults = await Promise.all(
      visionCandidates.map(async (attachment) => ({
        attachment,
        caption: await generateImageCaptionForDataUrl(
          attachment.key,
          attachment.dataUrl,
          input.imageCaptioning,
          AbortSignal.timeout(120_000),
        ),
      })),
    );
    visionAttachments = [];
    for (const result of captionResults) {
      if (result.caption) captionedImages.set(result.attachment.key, result.caption);
      else visionAttachments.push(result.attachment);
    }
  }
  const attachedImageKeys = new Set(visionAttachments.map((attachment) => attachment.key));
  const visionManifest = formatNoodleVisionManifest(visionAttachments);

  const buildContext = (
    imageKeys: ReadonlySet<string>,
    imageManifest: string,
    imageCaptions: ReadonlyMap<string, string>,
  ) => {
    const now = new Date();
    const tz = localScheduleTimezone();
    const currentTimeStr = now.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    });
    return [
      "# Current Time",
      `The real-world current date and time is: ${currentTimeStr}.`,
      "",
      "# Active Noodle Accounts",
      activeAccountList || "No active accounts.",
      "",
      "# User Persona",
      personaContext,
      "",
      "# Persona Identity Rule",
      NOODLE_PERSONA_IDENTITY_INSTRUCTION,
      "The User Persona above is the identity selected for this refresh only. Historical timeline authors retain the distinct accountKey recorded on their own activity.",
      "",
      "# Character Profiles",
      characterContext || "No character profiles.",
      "",
      ...(loreContext ? ["# World / Lore", loreContext, ""] : []),
      ...(randomUserContext ? ["# Random User Profiles", randomUserContext, ""] : []),
      "# Opted-In Chat Context",
      "Only chats whose Chat Settings allow Noodle references are included here.",
      chatContext,
      "",
      "# Recent Noodle Timeline",
      "Recent persona comments are especially relevant. Characters may naturally respond to them by using the comment replyId as parentInteractionId.",
      formatNoodleTimelineForPrompt(recentPosts, recentInteractions, {
        priorityActorAccountId: input.personaAccount?.id,
        attachedImageKeys: imageKeys,
        imageCaptions,
      }),
      ...(recalledPosts.length > 0
        ? [
            "",
            "# Randomly Recalled Older Noodle Activity",
            enhancedTimelineWriting ? NOODLE_RECALLED_MEMORY_INSTRUCTION : NOODLE_LEGACY_RECALLED_MEMORY_INSTRUCTION,
            formatNoodleTimelineForPrompt(recalledPosts, recalledInteractions, {
              emptyMessage: "No older Noodle activity was recalled.",
              includeTimestamp: true,
              priorityActorAccountId: input.personaAccount?.id,
              attachedImageKeys: imageKeys,
              imageCaptions,
            }),
          ]
        : []),
      ...(imageManifest ? ["", imageManifest] : []),
      ...(timelineFeatureInstructions.length > 0
        ? ["", "# Enabled Timeline Features", ...timelineFeatureInstructions]
        : []),
      "",
      "# Quotas",
      `posts: at most ${input.settings.maxGeneratedPostsPerRefresh}`,
      `replies: at most ${input.settings.maxRepliesPerRefresh}`,
      `reposts: at most ${input.settings.maxRepostsPerRefresh}`,
      `likes: at most ${input.settings.maxLikesPerRefresh}`,
      "follows: optional; use sparingly when an account would naturally follow another active account after today's public activity.",
      input.settings.enableImagePrompts
        ? `image generation: at most ${input.settings.maxImagesPerRefresh} images this refresh; imagePrompt may request either a character image or a meme. For character images, choose one clear visible-character viewpoint: selfie or mirror selfie (the character is visible holding the phone or in the reflection), a photo taken by a friend (the character is visible), or a back-facing or over-the-shoulder photo (the character is visible from behind). Do not use first-person POV, an empty scene, or an unseen camera operator's viewpoint unless the post explicitly asks for it. Default to casual phone selfies, mirror selfies, back-facing or over-the-shoulder photos, handheld candid shots, or photos taken by a friend. Use a tripod, studio, professional photographer, posed photoshoot, or polished commercial photography only when the character's occupation, wealth, setting, or post context makes that plausible. Vary framing and do not always show the character's face. Describe concrete appearance, build, clothing, and scene composition. For memes, describe the meme format, visual gag, intended caption/text if any, and why it fits the author's personality.`
        : "image generation: disabled; omit imagePrompt or return null.",
      input.settings.allowGalleryImageAttachments
        ? "gallery attachments: enabled; you may set attachGalleryImage true on posts that should reuse existing character/chat gallery media."
        : "gallery attachments: disabled; set attachGalleryImage false or omit it.",
    ].join("\n");
  };

  const context = buildContext(attachedImageKeys, visionManifest, captionedImages);
  const textOnlyContext = buildContext(new Set(), "", captionedImages);

  const outputFormat = [
    NOODLE_JSON_OUTPUT_HEADING,
    JSON.stringify(
      {
        posts: [
          {
            tempId: "local id used only inside this response",
            authorHandle: "exact @handle of a non-persona account allowed to author generated activity",
            content: "post text",
            poll: { question: "optional poll question", options: ["first answer", "second answer"] },
            imagePrompt: "optional image prompt or null",
            attachGalleryImage: false,
          },
        ],
        interactions: [
          {
            actorHandle: "exact @handle of a non-persona account allowed to perform generated activity",
            targetTempId: "tempId from posts, if targeting a newly created post",
            targetPostId: "existing post id, if targeting an existing post",
            parentInteractionId: "existing replyId when directly answering a comment, otherwise null",
            type: "like | repost | reply | vote",
            content: "required for reply, optional/null otherwise",
            pollOptionIndex: 1,
          },
        ],
        follows: [
          {
            actorHandle: "exact @handle of a non-persona account allowed to perform generated activity",
            targetHandle: "exact @handle from Active Noodle Accounts",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");

  const messages = [
    { role: "system" as const, content: system },
    {
      role: "user" as const,
      content: context,
      ...(visionAttachments.length > 0 ? { images: visionAttachments.map((attachment) => attachment.dataUrl) } : {}),
    },
    { role: "user" as const, content: outputFormat },
  ] satisfies ChatMessage[];
  const textOnlyMessages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: textOnlyContext },
    { role: "user" as const, content: outputFormat },
  ] satisfies ChatMessage[];
  return {
    messages,
    textOnlyMessages,
    promptForLog: `${system}\n\n${context}\n\n${outputFormat}\n\n[${visionAttachments.length} Noodle timeline image input(s) attached]`,
    textOnlyPromptForLog: `${system}\n\n${textOnlyContext}\n\n${outputFormat}`,
    visionAttachmentCount: visionAttachments.length,
    captionedImageCount: captionedImages.size,
    recalledPostIds: recalledPosts.map((post) => post.id),
    lorebookActivatedEntryIds: lorebookResult?.activatedEntryIds ?? [],
  };
}

async function generateMissingNoodleProfiles(input: {
  noodle: ReturnType<typeof createNoodleStorage>;
  characters: ReturnType<typeof createCharactersStorage>;
  characterGallery: ReturnType<typeof createCharacterGalleryStorage>;
  accounts: NoodleAccount[];
  provider: ReturnType<typeof createLLMProvider>;
  connection: {
    provider: string;
    model: string;
    maxTokensOverride?: number | null;
  };
  debugMode: boolean;
}) {
  const targets: Array<{
    account: NoodleAccount;
    row: { id: string; data: unknown; avatarPath?: string | null };
    bannerUrl: string | null;
  }> = [];
  for (const account of noodleAccountsNeedingProfiles(input.accounts)) {
    const row = await input.characters.getById(account.entityId);
    if (!row) continue;
    const bannerUrl = await pickRandomCharacterBannerUrl(input.characterGallery, account.entityId);
    targets.push({ account, row, bannerUrl });
  }
  if (targets.length === 0) return;

  const characterBlocks = targets
    .map(({ account, row }) =>
      [
        `<profile_target entityId="${account.entityId}" currentName="${account.displayName}" currentHandle="${account.handle}">`,
        characterContextFromRow(row),
        `</profile_target>`,
      ].join("\n"),
    )
    .join("\n\n");
  const outputFormat = [
    NOODLE_JSON_OUTPUT_HEADING,
    JSON.stringify(
      {
        profiles: [
          {
            entityId: "exact entityId from profile_target",
            name: "display name for the social profile",
            handle: "short @nickname without @, lowercase letters/numbers/underscores preferred",
            bio: "short in-character social media bio",
            location: "short profile location, fictional or canonical if known",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You set up fake Noodle social media profiles for existing Marinara Engine characters.",
        NOODLE_ADULT_PLATFORM_POLICY,
        "Create concise profile metadata only. Do not write posts, replies, likes, or timeline content.",
        "Use each character's personality, setting, and appearance to make the profile feel natural and in character.",
        "Return JSON only. No prose outside the JSON object.",
      ].join("\n"),
    },
    {
      role: "user",
      content: ["# Characters Needing Noodle Profiles", characterBlocks, "", outputFormat].join("\n"),
    },
  ];
  const promptForLog = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
  logDebugOverride(input.debugMode, "[debug/noodle] Profile prompt sent to model:\n%s", promptForLog);
  const maxTokens = clampGenerationMaxOutputTokens({
    provider: input.connection.provider as APIProvider,
    model: input.connection.model,
    maxTokens: profileSetupMaxTokens(targets.length),
    maxTokensOverride: input.connection.maxTokensOverride,
  });
  const result = await input.provider.chatComplete(messages, {
    model: input.connection.model,
    maxTokens,
    temperature: 0.55,
    topP: 0.9,
    stream: false,
    debugMode: input.debugMode,
    responseFormat: noodleResponseFormat(input.connection.model, "profiles"),
  });
  const generated = parseNoodleGeneratedProfiles(parseGameJsonish(result.content ?? ""));
  if (generated.rejected.length > 0) {
    logger.warn(
      "[noodle] Skipped %d invalid generated profile row(s); valid profiles will still be applied",
      generated.rejected.length,
    );
  }
  const profileByEntityId = new Map(generated.profiles.map((profile) => [profile.entityId, profile]));

  for (const target of targets) {
    const profile = profileByEntityId.get(target.account.entityId);
    if (!profile) continue;
    await input.noodle.updateAccountProfile(target.account.id, {
      handle: profile.handle,
      displayName: profile.name,
      bio: profile.bio,
      avatarUrl: target.row.avatarPath ?? target.account.avatarUrl,
      profile: generatedProfileSettings(profile.location, target.bannerUrl),
    });
  }
}

function interactionDigestVerb(type: NoodleInteractionType) {
  if (type === "reply") return "replied on";
  if (type === "repost") return "reposted";
  if (type === "vote") return "voted in";
  return "liked";
}

type NoodlePromptConnection = NonNullable<Awaited<ReturnType<ReturnType<typeof createConnectionsStorage>["getWithKey"]>>>;
function noodleDigestAccountLabel(account: Pick<NoodleAccount, "kind" | "displayName" | "handle">) {
  const identity = `${account.displayName} (@${account.handle})`;
  return account.kind === "persona" ? `Persona ${identity}` : identity;
}

async function generateNoodlePostImage(input: {
  account: NoodleAccount;
  referenceAccounts: NoodleAccount[];
  postContent: string;
  draftPrompt: string;
  settings: NoodleSettings;
  characters: ReturnType<typeof createCharactersStorage>;
  characterGallery: ReturnType<typeof createCharacterGalleryStorage>;
  promptOverrides: ReturnType<typeof createPromptOverridesStorage>;
  imageConnection: NonNullable<Awaited<ReturnType<ReturnType<typeof createConnectionsStorage>["getWithKey"]>>>;
  /** The text-generation LLM connection used to refine the draft image prompt. When omitted the template is used as-is. */
  promptConnection?: NoodlePromptConnection | null;
  app: FastifyInstance;
  debugMode: boolean;
  previewOnly?: boolean;
  promptOverride?: { prompt: string; negativePrompt?: string };
}) {
  const imageSettings = await loadImageGenerationUserSettings(input.app.db);
  const imageDefaults = resolveConnectionImageDefaults(input.imageConnection);
  const imageModel = input.imageConnection.model || "";
  const imageBaseUrl = input.imageConnection.baseUrl || "https://image.pollinations.ai";
  const imageSource = input.imageConnection.imageGenerationSource || imageModel;
  const imageServiceHint = input.imageConnection.imageService || imageSource;
  const imageFallback = await resolveImageConnectionFallback(
    createConnectionsStorage(input.app.db),
    input.imageConnection.id,
  );
  let characterDescription = "";
  let referenceImages: string[] | undefined;

  if (
    input.account.kind === "character" &&
    (input.settings.imageGenerationIncludeDescriptions || input.settings.imageGenerationUseAvatarReferences)
  ) {
    const character = await input.characters.getById(input.account.entityId);
    if (character) {
      const referenceAccountByEntityId = new Map(
        [input.account, ...input.referenceAccounts]
          .filter((account) => account.kind === "character")
          .map((account) => [account.entityId, account]),
      );
      const referenceRows = await Promise.all(
        Array.from(referenceAccountByEntityId.keys()).map((characterId) => input.characters.getById(characterId)),
      );
      const chatCharacters = referenceRows
        .filter((row): row is NonNullable<typeof row> => !!row)
        .map((row) => {
          const account = referenceAccountByEntityId.get(row.id);
          return {
            id: row.id,
            name: account?.displayName || characterNameFromRow(row),
            avatarPath: row.avatarPath ?? null,
            appearance: characterAppearanceFromRow(row),
          };
        });
      const referenceResolution = await resolveIllustratorCharacterReferences({
        charactersStore: input.characters,
        chatCharacters,
        persona: null,
        requestedNames: [input.account.displayName],
        promptText: [input.account.displayName, input.postContent, input.draftPrompt].join("\n"),
        maxReferences: 6,
      });
      if (input.settings.imageGenerationIncludeDescriptions && referenceResolution.appearanceBlock) {
        characterDescription = referenceResolution.appearanceBlock;
      }
      if (input.settings.imageGenerationUseAvatarReferences) {
        const builtInMariReferences =
          input.account.entityId === PROFESSOR_MARI_ID ? readProfessorMariReferenceImages() : [];
        const combinedReferences = [...builtInMariReferences, ...referenceResolution.referenceImages];
        if (combinedReferences.length > 0) {
          referenceImages = Array.from(new Set(combinedReferences)).slice(0, 6);
        }
      }
    }
  }

  const connectionHint =
    typeof input.imageConnection.imagePromptHint === "string" ? input.imageConnection.imagePromptHint.trim() : "";
  const postPrompt = await loadPrompt(input.promptOverrides, NOODLE_IMAGE_POST, {
    authorName: input.account.displayName,
    postContent: input.postContent,
    draftPrompt: input.draftPrompt,
    userInstructions: input.settings.imageGenerationPrompt,
    characterDescription,
    connectionHint,
  });

  // ── LLM refinement: use the text-gen connection to turn the draft into a
  // proper image-gen prompt (same pattern as selfie/illustrator flows).
  // Skip when the user has already reviewed and confirmed a prompt override.
  let refinedPrompt = postPrompt;
  if (input.promptConnection && !input.promptOverride) {
    try {
      const promptProvider = createLLMProvider(
        input.promptConnection.provider,
        resolveBaseUrl(input.promptConnection),
        input.promptConnection.apiKey,
        input.promptConnection.maxContext,
        input.promptConnection.openrouterProvider,
        input.promptConnection.maxTokensOverride,
        input.promptConnection.claudeFastMode === "true",
        input.promptConnection.treatAsLocalEndpoint === "true",
      );
      const llmResult = await promptProvider.chatComplete(
        [{ role: "user", content: postPrompt }],
        {
          model: input.promptConnection.model,
          temperature: input.settings.generationTemperature,
          topP: input.settings.generationTopP,
          maxTokens: 1024,
        },
      );
      const llmPrompt = (llmResult.content ?? "").trim();
      if (llmPrompt) {
        refinedPrompt = llmPrompt;
        logDebugOverride(
          input.debugMode,
          "[debug/noodle/image] LLM-refined prompt for %s:\n%s",
          input.account.displayName,
          refinedPrompt,
        );
      }
    } catch (err) {
      logger.warn(err, "[noodle] Image prompt refinement failed for %s; using template directly", input.account.displayName);
    }
  }

  const compiledPrompt = compileImagePrompt({
    kind: "illustration",
    prompt: refinedPrompt,
    styleProfiles: imageSettings.styleProfiles,
    imageDefaults,
  });
  const finalPrompt = input.promptOverride?.prompt.trim() || compiledPrompt.prompt;
  const finalNegativePrompt = input.promptOverride
    ? input.promptOverride.negativePrompt?.trim() || undefined
    : compiledPrompt.negativePrompt || undefined;
  logDebugOverride(
    input.debugMode,
    "[debug/noodle/image] final image prompt for %s:\n%s",
    input.account.displayName,
    finalPrompt,
  );
  if (finalNegativePrompt) {
    logDebugOverride(input.debugMode, "[debug/noodle/image] negative prompt:\n%s", finalNegativePrompt);
  }

  if (input.previewOnly) {
    const previewSize = resolveImagePromptReviewSize({
      connection: input.imageConnection,
      prompt: finalPrompt,
      width: imageSettings.illustration.width,
      height: imageSettings.illustration.height,
      imageDefaults,
    });
    return {
      imageUrl: null,
      metadata: {},
      preview: {
        kind: "illustration" as const,
        title: `${input.account.displayName} Noodle image`,
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        width: previewSize.width,
        height: previewSize.height,
      },
    };
  }

  const image = await generateNoodleImageWithRetry(
    () =>
      generateImage(imageSource, imageBaseUrl, input.imageConnection.apiKey || "", imageServiceHint, {
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        model: imageModel,
        width: imageSettings.illustration.width,
        height: imageSettings.illustration.height,
        imageEndpointId: input.imageConnection.imageEndpointId || undefined,
        comfyWorkflow: input.imageConnection.comfyuiWorkflow || undefined,
        imageDefaults,
        referenceImages,
        debugMode: input.debugMode,
        fallback: imageFallback,
      }),
    (error, attempt, maxAttempts) => {
      logger.warn(
        error,
        "[noodle] Image generation attempt %d/%d failed for %s",
        attempt,
        maxAttempts,
        input.account.displayName,
      );
    },
  );
  const provider = input.imageConnection.provider ?? "image_generation";
  if (input.account.kind === "character") {
    const filePath = saveImageToDisk(`characters/${input.account.entityId}`, image.base64, image.ext);
    const galleryImage = await input.characterGallery.create({
      characterId: input.account.entityId,
      filePath,
      prompt: finalPrompt,
      provider,
      model: imageModel || "unknown",
      width: imageSettings.illustration.width,
      height: imageSettings.illustration.height,
    });
    return {
      imageUrl: characterGalleryImageUrl(input.account.entityId, filePath),
      metadata: {
        imageGenerated: true,
        imageProvider: provider,
        imageModel: imageModel || "unknown",
        imageStyleProfileId: compiledPrompt.profile.id,
        characterGalleryImageId: galleryImage?.id ?? null,
      },
      preview: null,
    };
  }

  const filePath = saveImageToDisk("noodle", image.base64, image.ext);
  return {
    imageUrl: galleryImageUrl(filePath, "noodle"),
    metadata: {
      imageGenerated: true,
      imageProvider: provider,
      imageModel: imageModel || "unknown",
      imageStyleProfileId: compiledPrompt.profile.id,
    },
    preview: null,
  };
}

const noodleImagePromptConfirmationSchema = z.object({
  prompts: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().trim().min(1).max(20_000),
        negativePrompt: z.string().trim().max(20_000).optional(),
      }),
    )
    .max(20),
  debugMode: z.boolean().optional(),
});

const NOODLER_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const NOODLER_MEDIA_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"]);

class NoodlerMediaRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

async function readNoodlerMultipart(
  req: FastifyRequest,
): Promise<{ payload: unknown; media: NoodlerPostMediaUpload }> {
  let payload: unknown;
  let media: NoodlerPostMediaUpload | null = null;
  for await (const part of req.parts({ limits: { fileSize: NOODLER_MEDIA_MAX_BYTES, files: 1 } })) {
    if (part.type === "field") {
      if (part.fieldname === "payload") {
        try {
          payload = JSON.parse(String(part.value));
        } catch {
          throw new NoodlerMediaRequestError("The image request payload is invalid.", 400);
        }
      }
      continue;
    }
    if (part.fieldname !== "file" || media) {
      part.file.resume();
      throw new NoodlerMediaRequestError("Upload one image in the file field.", 400);
    }
    const extension = extname(part.filename).toLowerCase();
    if (!NOODLER_MEDIA_EXTENSIONS.has(extension)) {
      part.file.resume();
      throw new NoodlerMediaRequestError("Unsupported image file type.", 400);
    }
    let buffer: Buffer;
    try {
      buffer = await part.toBuffer();
    } catch (error) {
      const truncated = (part.file as typeof part.file & { truncated?: boolean }).truncated === true;
      const tooLarge = truncated || (error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE";
      throw new NoodlerMediaRequestError(
        tooLarge ? "NoodleR image is too large." : "Failed to read the uploaded image.",
        tooLarge ? 413 : 400,
      );
    }
    const detected = isAllowedImageBuffer(buffer, extension);
    if (!detected || (extension === ".jpeg" ? "jpg" : extension.slice(1)) !== detected.ext) {
      throw new NoodlerMediaRequestError("Unsupported or invalid image file.", 400);
    }
    media = { buffer, extension: detected.ext };
  }
  if (payload === undefined) {
    throw new NoodlerMediaRequestError("The image request payload is required.", 400);
  }
  if (!media) throw new NoodlerMediaRequestError("Upload one image in the file field.", 400);
  return { payload, media };
}

async function importNoodlerMedia(imageUrl: string): Promise<NoodlerPostMediaUpload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await safeFetch(imageUrl, {
      signal: controller.signal,
      policy: {
        allowLocal: false,
        allowLoopback: false,
        allowedProtocols: ["http:", "https:"],
        maxRedirects: 3,
      },
      maxResponseBytes: NOODLER_MEDIA_MAX_BYTES,
      allowedContentTypes: ["image/"],
      allowMissingContentType: true,
      headers: { Accept: "image/*" },
    });
    if (!response.ok) {
      throw new NoodlerMediaRequestError(`Image URL returned HTTP ${response.status}.`, 400);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const detected = isAllowedImageBuffer(buffer);
    if (!detected) {
      throw new NoodlerMediaRequestError("The URL did not return a supported image.", 415);
    }
    return { buffer, extension: detected.ext };
  } catch (error) {
    if (error instanceof NoodlerMediaRequestError) throw error;
    logger.warn(error, "[noodler] Could not import image URL");
    const tooLarge = error instanceof Error && /exceeded \d+ bytes/iu.test(error.message);
    throw new NoodlerMediaRequestError(
      tooLarge
        ? "NoodleR image is too large."
        : "Could not download that image URL. Check that it is public and points directly to an image.",
      tooLarge ? 413 : 400,
    );
  } finally {
    clearTimeout(timeout);
  }
}

type DecodedNoodlerMediaRequest<T> =
  | { success: true; data: T; media: NoodlerPostMediaUpload | undefined }
  | { success: false; error: z.ZodError };

async function decodeNoodlerMediaRequest<
  WithMediaSchema extends z.ZodTypeAny,
  WithoutMediaSchema extends z.ZodTypeAny,
>(
  req: FastifyRequest,
  schemas: { withMedia: WithMediaSchema; withoutMedia: WithoutMediaSchema },
): Promise<DecodedNoodlerMediaRequest<z.output<WithMediaSchema> | z.output<WithoutMediaSchema>>> {
  let payload: unknown = req.body;
  let media: NoodlerPostMediaUpload | undefined;
  if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
    const multipart = await readNoodlerMultipart(req);
    payload = multipart.payload;
    media = multipart.media;
  }

  const parsedForUrl = schemas.withMedia.safeParse(payload);
  const uploadedImageUrl =
    parsedForUrl.success &&
    typeof (parsedForUrl.data as { uploadedImageUrl?: unknown }).uploadedImageUrl === "string"
      ? (parsedForUrl.data as { uploadedImageUrl: string }).uploadedImageUrl
      : undefined;
  if (uploadedImageUrl) {
    if (media) {
      throw new NoodlerMediaRequestError("Choose either an uploaded file or an image URL.", 400);
    }
    media = await importNoodlerMedia(uploadedImageUrl);
  }

  const parsed = (media ? schemas.withMedia : schemas.withoutMedia).safeParse(payload);
  return parsed.success
    ? { success: true, data: parsed.data, media }
    : { success: false, error: parsed.error };
}

function sendNoodlerMediaError(reply: FastifyReply, error: unknown) {
  const tooLarge = (error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE";
  const statusCode =
    tooLarge
      ? 413
      : error instanceof NoodlerMediaRequestError
        ? error.statusCode
        : 500;
  if (statusCode === 500) logger.error(error, "[noodler] Image request failed");
  return reply.code(statusCode).send({
    error:
      statusCode === 500
        ? "Image request failed."
        : tooLarge
          ? "NoodleR image is too large."
          : (error as Error).message,
  });
}

export async function noodleRoutes(app: FastifyInstance) {
  const noodle = createNoodleStorage(app.db);
  const characters = createCharactersStorage(app.db);
  const chats = createChatsStorage(app.db);
  const connections = createConnectionsStorage(app.db);
  const gallery = createGalleryStorage(app.db);
  const characterGallery = createCharacterGalleryStorage(app.db);
  const promptOverrides = createPromptOverridesStorage(app.db);
  const noodlerImages = createNoodlerNoodleImagesService(app.db);
  let refreshInFlight = false;

  app.get("/", async () => {
    return bootstrapVisibleNoodle(noodle, characters);
  });

  app.put("/settings", async (req, reply) => {
    const parsed = noodleSettingsUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return noodle.updateSettings(parsed.data);
  });

  app.get("/noodler/accounts", async (_req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    return noodle.listNoodlerStageProfiles();
  });

  async function resolveViewerPersona(personaId: string) {
    const account = await noodle.getAccountByEntity("persona", personaId);
    return account?.platform === "noodle" ? account : null;
  }

  // Shared viewer-scope builder: also returned from the unlock/subscribe mutations so the
  // client can patch its cache in place instead of refetching the whole feed (avoids the
  // reload-and-jump when a post is revealed).
  async function buildViewerScope(viewer: NonNullable<Awaited<ReturnType<typeof resolveViewerPersona>>>) {
    const [accounts, profiles, subscriptions, unlocks] = await Promise.all([
      noodle.listNoodlerAccounts(),
      noodle.listNoodlerStageProfiles(),
      noodle.listSubscriptionsForViewer(viewer.id),
      noodle.listPostUnlocksForViewer(viewer.id),
    ]);
    const subscribedIds = new Set(subscriptions.map((item) => item.creatorAccountId));
    const unlockedIds = new Set(unlocks.map((item) => item.postId));
    const profileById = new Map(
      profiles.map(({ access: _access, ...profile }) => [
        profile.id,
        {
          ...profile,
          noodleAccountId: profile.disclosureMode === "open" ? profile.noodleAccountId : null,
        },
      ]),
    );
    const visibleAccounts = accounts.filter(
      (account) => account.noodleAccountId === viewer.id || !isNoodlerHiddenFromViewer(account, viewer.id),
    );
    const postsByAccount = await noodle.listNoodlerPostsByAccounts(
      visibleAccounts.map((account) => account.id),
      40,
    );
    const viewablePostIds = new Set<string>();
    for (const account of visibleAccounts) {
      const ownCreator = account.noodleAccountId === viewer.id;
      const subscribed = subscribedIds.has(account.id);
      for (const post of postsByAccount.get(account.id) ?? []) {
        if (
          ownCreator ||
          canViewNoodlerPost({
            post,
            subscribed,
            unlockedPostIds: unlockedIds,
            subscriptionIncludesPpv: account.settings.privacy.access.subscriptionIncludesPpv,
          })
        ) {
          viewablePostIds.add(post.id);
        }
      }
    }
    // Counts are loaded for every post so locked teasers can show real engagement;
    // the interaction records themselves stay redacted unless the post is viewable.
    const allPostIds = [...postsByAccount.values()].flatMap((posts) => posts.map((post) => post.id));
    const interactionsByPostId = new Map<string, NoodlerPostView["interactions"]>();
    for (const interaction of await noodle.listNoodlerInteractions(allPostIds)) {
      const existing = interactionsByPostId.get(interaction.postId) ?? [];
      existing.push(interaction);
      interactionsByPostId.set(interaction.postId, existing);
    }
    const creators = visibleAccounts.map((account) => {
      const subscribed = subscribedIds.has(account.id);
      const posts = postsByAccount.get(account.id) ?? [];
      return {
        profile: profileById.get(account.id)!,
        subscribed,
        posts: posts.map((post): NoodlerPostView => {
          const locked = !viewablePostIds.has(post.id);
          const interactions = interactionsByPostId.get(post.id) ?? [];
          return {
            id: post.id,
            authorAccountId: post.authorAccountId,
            access: post.access,
            ppvPrice: post.ppvPrice,
            locked,
            // Locked posts still surface title, image, and engagement counts (Patreon-style
            // teaser); only the body text and image prompt stay hidden until unlocked.
            title: post.title,
            content: locked ? null : post.content,
            imageUrl: post.imageUrl,
            imagePrompt: locked ? null : post.imagePrompt,
            metadata: locked ? null : post.metadata,
            createdAt: post.createdAt,
            interactions: locked ? [] : interactions,
            likeCount: interactions.filter((item) => item.type === "like").length,
            replyCount: interactions.filter((item) => item.type === "reply").length,
          };
        }),
      };
    });
    return { viewer, creators };
  }

  app.get("/noodler/viewer", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerViewerPersonaSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const viewer = await resolveViewerPersona(parsed.data.personaId);
    if (!viewer) return reply.code(404).send({ error: "Noodle persona not found" });
    return await buildViewerScope(viewer);
  });

  async function resolveReadableNoodlerPost(personaId: string, postId: string) {
    const viewer = await resolveViewerPersona(personaId);
    const post = viewer ? await noodle.getNoodlerPostById(postId) : null;
    const creator = post ? await noodle.getNoodlerAccountById(post.authorAccountId) : null;
    if (!viewer || !post || !creator || isNoodlerHiddenFromViewer(creator, viewer.id)) return null;
    if (creator.noodleAccountId === viewer.id) return { viewer, post, creator };
    const [subscriptions, unlocks] = await Promise.all([
      noodle.listSubscriptionsForViewer(viewer.id),
      noodle.listPostUnlocksForViewer(viewer.id),
    ]);
    const subscribed = subscriptions.some((item) => item.creatorAccountId === creator.id);
    const locked = !canViewNoodlerPost({
      post,
      subscribed,
      unlockedPostIds: new Set(unlocks.map((item) => item.postId)),
      subscriptionIncludesPpv: creator.settings.privacy.access.subscriptionIncludesPpv,
    });
    if (locked) return null;
    return { viewer, post, creator };
  }

  async function resolveGatedNoodlerPost(personaId: string, postId: string) {
    const readable = await resolveReadableNoodlerPost(personaId, postId);
    // A viewer persona linked to the creator's own public account may read its posts, but
    // is not an audience member and must not persist self-interactions.
    if (!readable || readable.creator.noodleAccountId === readable.viewer.id) return null;
    return readable;
  }

  // Access-checked serving for NoodleR-owned media. A persona query gates as a fan
  // (subscriber/PPV/hidden all enforced); no persona is the trusted owner/management path.
  // The bytes live outside any publicly readable gallery namespace, so this is the only way
  // to reach them.
  app.get("/noodler/posts/:id/media", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    const personaId = (req.query as { personaId?: string }).personaId;
    const post = personaId ? (await resolveGatedNoodlerPost(personaId, id))?.post : await noodle.getNoodlerPostById(id);
    if (!post) return reply.code(404).send({ error: "Not Found" });
    const mediaPath = readNoodlerMediaPath(post);
    const absolute = mediaPath ? resolveNoodlerMediaAbsolutePath(mediaPath) : null;
    if (!absolute || !existsSync(absolute)) return reply.code(404).send({ error: "Not Found" });
    return reply.header("Cache-Control", "private, no-store").sendFile(basename(absolute), dirname(absolute));
  });

  app.post("/noodler/posts/:id/interactions", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerCreateInteractionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const gated = await resolveGatedNoodlerPost(parsed.data.personaId, id);
    if (!gated) return reply.code(404).send({ error: "NoodleR post not found" });
    if (parsed.data.type === "vote") {
      const poll = readNoodlePollFromMetadata(gated.post.metadata);
      const optionId = parsed.data.content?.trim() ?? "";
      if (!poll?.options.some((option) => option.id === optionId)) {
        return reply.code(400).send({ error: "Choose a valid poll option." });
      }
    }
    const interaction = await noodle.createNoodlerInteraction(id, {
      actorAccountId: gated.viewer.id,
      type: parsed.data.type,
      content: parsed.data.content ?? null,
      parentInteractionId: parsed.data.parentInteractionId ?? null,
    });
    if (!interaction) return reply.code(400).send({ error: "Could not add that NoodleR interaction." });
    return reply.code(201).send(interaction);
  });

  app.delete("/noodler/posts/:id/interactions", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerRemoveInteractionSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const gated = await resolveGatedNoodlerPost(parsed.data.personaId, id);
    if (!gated) return reply.code(404).send({ error: "NoodleR post not found" });
    const interaction = await noodle.deleteNoodlerInteraction(id, {
      actorAccountId: gated.viewer.id,
      type: parsed.data.type,
      parentInteractionId: parsed.data.parentInteractionId ?? null,
    });
    if (!interaction) return reply.code(404).send({ error: "NoodleR interaction not found" });
    return interaction;
  });

  // NoodleR posts are stage-profile posts the user fully owns, so edit/delete route
  // through the NoodleR-only storage methods (getNoodlerPostById) rather than the Noodle
  // /posts endpoints, which reject any post whose author is not a Noodle account.
  app.patch("/noodler/posts/:id", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerPostUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const existing = await noodle.getNoodlerPostById(id);
    if (!existing) return reply.code(404).send({ error: "NoodleR post not found" });
    const nextContent = parsed.data.content === undefined ? existing.content : parsed.data.content;
    const nextPoll =
      parsed.data.poll === undefined
        ? readNoodlePollFromMetadata(existing.metadata)
        : parsed.data.poll
          ? createNoodlePoll(parsed.data.poll)
          : null;
    const nextHasImage = parsed.data.removeImage ? false : Boolean(existing.imageUrl);
    if (!nextContent.trim() && !nextPoll && !nextHasImage) {
      return reply.code(400).send({ error: "Posts need a body, image, or poll." });
    }
    // The media path has to be re-read under the lock: the pre-lock `existing` snapshot can
    // name a file a concurrent write already replaced, and unlinking that deletes live bytes.
    const locked = await tryNoodlerAccountOperation(existing.authorAccountId, async () => {
      const current = parsed.data.removeImage ? await noodle.getNoodlerPostById(id) : null;
      const updated = await noodle.updateNoodlerPost(id, parsed.data);
      return updated ? { updated, staleMedia: current ? readNoodlerMediaPath(current) : null } : null;
    });
    if (!locked.acquired) {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    if (!locked.value) return reply.code(404).send({ error: "NoodleR post not found" });
    if (parsed.data.removeImage) unlinkNoodlerMedia(locked.value.staleMedia);
    return locked.value.updated;
  });

  app.post("/noodler/posts", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    let decoded: DecodedNoodlerMediaRequest<
      z.output<typeof noodlerPostCreateWithMediaSchema> | z.output<typeof noodlerPostCreateSchema>
    >;
    try {
      decoded = await decodeNoodlerMediaRequest(req, {
        withMedia: noodlerPostCreateWithMediaSchema,
        withoutMedia: noodlerPostCreateSchema,
      });
    } catch (error) {
      return sendNoodlerMediaError(reply, error);
    }
    if (!decoded.success) return reply.code(400).send({ error: decoded.error.flatten() });
    const result = await createNoodlerPost(app.db, decoded.data, decoded.media);
    if (result.status === "created") return reply.code(201).send(result.post);
    if (result.status === "busy") {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    if (result.status === "disabled") return reply.code(404).send({ error: "Not Found" });
    return reply.code(404).send({ error: "NoodleR stage profile not found" });
  });

  app.post("/noodler/posts/:id/media", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    let multipart: Awaited<ReturnType<typeof readNoodlerMultipart>>;
    try {
      multipart = await readNoodlerMultipart(req);
    } catch (error) {
      return sendNoodlerMediaError(reply, error);
    }
    const parsed = noodlerPostUpdateSchema.safeParse(multipart.payload);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (parsed.data.removeImage) {
      return reply.code(400).send({ error: "A replacement image cannot also remove the image." });
    }
    const result = await updateNoodlerPostWithMedia(app.db, id, parsed.data, multipart.media);
    if (result.status === "updated") return result.post;
    if (result.status === "busy") {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    if (result.status === "disabled") return reply.code(404).send({ error: "Not Found" });
    return reply.code(404).send({ error: "NoodleR post not found" });
  });

  app.delete("/noodler/posts/:id", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    const existing = await noodle.getNoodlerPostById(id);
    if (!existing) return reply.code(404).send({ error: "NoodleR post not found" });
    const locked = await tryNoodlerAccountOperation(existing.authorAccountId, () => noodle.deleteNoodlerPost(id));
    if (!locked.acquired) {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    if (!locked.value) return reply.code(404).send({ error: "NoodleR post not found" });
    unlinkNoodlerMedia(readNoodlerMediaPath(locked.value));
    return locked.value;
  });

  app.post("/noodler/accounts/:id/subscribe", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const [viewer, creator] = await Promise.all([
      resolveViewerPersona(parsed.data.personaId),
      noodle.getNoodlerAccountById(id),
    ]);
    if (!viewer || !creator || creator.noodleAccountId === viewer.id || isNoodlerHiddenFromViewer(creator, viewer.id)) {
      return reply.code(404).send({ error: "NoodleR stage profile not found" });
    }
    const subscription = await noodle.subscribe(viewer.id, creator.id);
    if (!subscription) return reply.code(400).send({ error: "Could not subscribe to this stage profile" });
    return reply.code(201).send(await buildViewerScope(viewer));
  });

  app.delete("/noodler/accounts/:id/subscribe", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerSubscriptionSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const viewer = await resolveViewerPersona(parsed.data.personaId);
    if (!viewer) return reply.code(404).send({ error: "Noodle persona not found" });
    const { id } = req.params as { id: string };
    await noodle.unsubscribe(viewer.id, id);
    return await buildViewerScope(viewer);
  });

  app.get("/noodler/accounts/:id/subscribers", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    if (!(await noodle.getNoodlerAccountById(id))) {
      return reply.code(404).send({ error: "NoodleR stage profile not found" });
    }
    const subscriptions = await noodle.listSubscriptionsForCreator(id);
    const subscribers = (
      await Promise.all(
        subscriptions.map(async (subscription): Promise<NoodlerSubscriber | null> => {
          const account = await noodle.getAccountById(subscription.viewerAccountId);
          if (!account || account.platform !== "noodle" || account.kind !== "persona") return null;
          return {
            id: account.id,
            displayName: account.displayName,
            handle: account.handle,
            avatarUrl: account.avatarUrl,
            avatarCrop: account.avatarCrop,
            subscribedAt: subscription.createdAt,
          };
        }),
      )
    ).filter((subscriber): subscriber is NoodlerSubscriber => subscriber !== null);
    return subscribers;
  });

  app.post("/noodler/posts/:id/unlock", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerUnlockSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const [viewer, post] = await Promise.all([
      resolveViewerPersona(parsed.data.personaId),
      noodle.getNoodlerPostById(id),
    ]);
    const creator = post ? await noodle.getNoodlerAccountById(post.authorAccountId) : null;
    if (
      !viewer ||
      !post ||
      !creator ||
      post.access !== "ppv" ||
      creator.noodleAccountId === viewer.id ||
      isNoodlerHiddenFromViewer(creator, viewer.id)
    ) {
      return reply.code(404).send({ error: "NoodleR post not found" });
    }
    const unlock = await noodle.unlockPost(viewer.id, post.id);
    if (!unlock) return reply.code(400).send({ error: "Could not unlock this post" });
    return reply.code(201).send(await buildViewerScope(viewer));
  });

  app.get<{ Querystring: { limit?: string; offset?: string; search?: string; kind?: string } }>(
    "/noodler/eligible-accounts",
    async (req, reply) => {
      const settings = await noodle.getSettings();
      if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
      const [publicAccounts, noodlerAccounts] = await Promise.all([
        noodle.listAccounts(),
        noodle.listNoodlerAccounts(),
      ]);
      const linkedIds = new Set(noodlerAccounts.flatMap((account) => account.noodleAccountId ?? []));
      const search = (req.query.search ?? "").trim().toLocaleLowerCase();
      const kind = req.query.kind === "character" || req.query.kind === "persona" ? req.query.kind : null;
      const eligibleAccounts = publicAccounts.filter(
        (account) =>
          (account.kind === "persona" || account.kind === "character") &&
          (!kind || account.kind === kind) &&
          !linkedIds.has(account.id),
      );
      const filteredAccounts = search
        ? eligibleAccounts.filter((account) =>
            `${account.displayName} ${account.handle} ${account.bio}`.toLocaleLowerCase().includes(search),
          )
        : eligibleAccounts;
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      return {
        items: filteredAccounts.slice(offset, offset + limit),
        limit,
        offset,
        hasMore: offset + limit < filteredAccounts.length,
      };
    },
  );

  app.post("/noodler/stage-profile-draft", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodleStageProfileDraftRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const connectionId = parsed.data.connectionId || settings.generationConnectionId;
    if (!connectionId) return reply.code(400).send({ error: "Select a Noodle generation connection first." });
    const connection = await connections.getWithKey(connectionId);
    if (!connection) return reply.code(404).send({ error: "Noodle generation connection not found" });
    try {
      return await generateNoodlerStageProfileDraft(app.db, { request: parsed.data, connection });
    } catch (error) {
      logger.error(error, "[noodler] Stage profile draft generation failed");
      return reply.code(500).send({ error: getErrorMessage(error) });
    }
  });

  app.post("/accounts/:id/noodler", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodlerAccountCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const publicAccount = await noodle.getAccountById(id);
    if (
      publicAccount &&
      stageProfileContainsPublicIdentity(parsed.data.stageProfile, {
        displayName: publicAccount.displayName,
        handle: publicAccount.handle,
      })
    ) {
      return reply.code(400).send({
        error: "Hinted and secret stage profiles cannot use the linked public name or handle.",
      });
    }
    try {
      const created = await noodle.createNoodlerAccount(
        id,
        parsed.data.stageProfile,
        settings.autoPostingDefaultIntensity,
      );
      if (!created) return reply.code(404).send({ error: "Noodle account not found" });
      const profile = (await noodle.listNoodlerStageProfiles()).find((item) => item.id === created.id);
      if (!profile) throw new Error("Failed to load the created NoodleR stage profile.");
      return reply.code(201).send(profile);
    } catch (error) {
      if (isFileUniqueConstraintError(error, "noodle_accounts", ["noodleAccountId"])) {
        return reply.code(409).send({ error: "A NoodleR account already exists for this Noodle account." });
      }
      throw error;
    }
  });

  app.post("/noodler/accounts/bulk", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodleBulkNoodlerAccountCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { noodleAccountIds, disclosureMode } = parsed.data;
    const connectionId = settings.generationConnectionId;
    if (!connectionId) return reply.code(400).send({ error: "Select a Noodle generation connection first." });
    const connection = await connections.getWithKey(connectionId);
    if (!connection) return reply.code(404).send({ error: "Noodle generation connection not found" });
    const created: string[] = [];
    const skipped: string[] = [];
    // Operational failures (provider/storage) are reported apart from expected exclusions
    // so a provider outage cannot look like a batch of harmless skips.
    const failed: string[] = [];
    for (const noodleAccountId of noodleAccountIds) {
      const publicAccount = await noodle.getAccountById(noodleAccountId);
      if (!publicAccount) {
        skipped.push(noodleAccountId);
        continue;
      }
      try {
        // ponytail: sequential per-account LLM generation (up to 100). Correct but slow;
        // add a small concurrency limit only if bulk latency becomes a real complaint.
        const stageProfile = await generateNoodlerStageProfileDraft(app.db, {
          request: { noodleAccountId, disclosureMode, guidance: "" },
          connection,
        });
        // Belt-and-braces: the generator already enforces leak protection, but keep the guard.
        if (stageProfileContainsPublicIdentity(stageProfile, publicAccount)) {
          skipped.push(noodleAccountId);
          continue;
        }
        const account = await noodle.createNoodlerAccount(
          noodleAccountId,
          stageProfile,
          settings.autoPostingDefaultIntensity,
        );
        if (!account) {
          skipped.push(noodleAccountId);
          continue;
        }
        created.push(account.id);
      } catch (error) {
        if (isFileUniqueConstraintError(error, "noodle_accounts", ["noodleAccountId"])) {
          skipped.push(noodleAccountId);
          continue;
        }
        logger.error(error, "[noodler] Bulk stage profile generation failed for %s", noodleAccountId);
        failed.push(noodleAccountId);
        continue;
      }
    }
    const profiles = await noodle.listNoodlerStageProfiles();
    return reply.code(201).send({
      created: profiles.filter((profile) => created.includes(profile.id)),
      skipped,
      failed,
    });
  });

  app.put("/noodler/accounts/:id/stage-profile", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodleStageProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const locked = await tryNoodlerAccountOperation(id, async () => {
      const noodlerAccount = await noodle.getNoodlerAccountById(id);
      const publicAccount = noodlerAccount?.noodleAccountId
        ? await noodle.getAccountById(noodlerAccount.noodleAccountId)
        : null;
      if (
        publicAccount &&
        stageProfileContainsPublicIdentity(parsed.data, {
          displayName: publicAccount.displayName,
          handle: publicAccount.handle,
        })
      ) {
        return { status: "identity_conflict" } as const;
      }
      const updated = await noodle.updateNoodlerStageProfile(id, parsed.data);
      if (!updated) return { status: "not_found" } as const;
      const profile = (await noodle.listNoodlerStageProfiles()).find((item) => item.id === updated.id);
      if (!profile) throw new Error("Failed to load the updated NoodleR stage profile.");
      return { status: "updated", profile } as const;
    });
    if (!locked.acquired) {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    if (locked.value.status === "identity_conflict") {
      return reply.code(400).send({
        error: "Hinted and secret stage profiles cannot use the linked public name or handle.",
      });
    }
    if (locked.value.status === "not_found") {
      return reply.code(404).send({ error: "NoodleR stage profile not found" });
    }
    return locked.value.profile;
  });

  app.delete("/noodler/accounts/:id", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    const locked = await tryNoodlerAccountOperation(id, () => noodle.deleteNoodlerAccount(id));
    if (!locked.acquired) {
      return reply.code(409).send({ error: "Another operation for this NoodleR account is already running." });
    }
    const deleted = locked.value;
    if (!deleted) return reply.code(404).send({ error: "NoodleR stage profile not found" });
    removeNoodlerAccountMedia(id);
    return deleted;
  });

  app.get("/noodler/accounts/:id/posts", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    if (!(await noodle.getNoodlerAccountById(id))) {
      return reply.code(404).send({ error: "NoodleR stage profile not found" });
    }
    return noodle.listNoodlerPostsByAccount(id, 40);
  });

  app.put("/refresh-schedule", async (req, reply) => {
    const parsed = noodleRescheduleRefreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (refreshInFlight) return reply.code(409).send({ error: "Wait for the current Noodle refresh to finish." });
    const at = new Date();
    const schedule = await noodle.ensureRefreshSchedule(at);
    try {
      const rescheduled = rescheduleNoodleRefreshTime(schedule, parsed.data.scheduledTime, parsed.data.time, at);
      await noodle.saveRefreshSchedule(rescheduled);
      return noodleRefreshSchedulerStatus(rescheduled, at);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not reschedule refresh." });
    }
  });

  app.put("/accounts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = noodleAccountUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let updated: NoodleAccount | null;
    try {
      updated = await noodle.updateAccount(id, parsed.data);
    } catch (error) {
      if (isFileUniqueConstraintError(error, "noodle_accounts", ["handle"])) {
        return reply.code(409).send({ code: "NOODLE_HANDLE_TAKEN", error: "That Noodle handle is already in use." });
      }
      throw error;
    }
    if (!updated) return reply.code(404).send({ error: "Noodle account not found" });
    return updated;
  });

  app.put("/accounts/:id/profile", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = noodleAccountProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await noodle.getAccountById(id);
    if (!existing) return reply.code(404).send({ error: "Noodle account not found" });
    const sourceCharacter = existing.kind === "character" ? await characters.getById(existing.entityId) : null;
    const avatarCrop = resolveNoodleAvatarCropAfterProfileUpdate({
      currentAvatarUrl: existing.avatarUrl,
      nextAvatarUrl: parsed.data.avatarUrl,
      currentCrop: existing.avatarCrop,
      sourceAvatarUrl: sourceCharacter?.avatarPath,
      sourceCrop: sourceCharacter ? characterAvatarCrop(sourceCharacter) : null,
    });
    const profileFieldsChanged =
      existing.kind === "character" &&
      (parsed.data.handle !== undefined ||
        parsed.data.displayName !== undefined ||
        parsed.data.bio !== undefined ||
        parsed.data.avatarUrl !== undefined);
    let updated: NoodleAccount | null;
    try {
      updated = await noodle.updateAccountProfile(id, {
        ...parsed.data,
        ...((profileFieldsChanged || parsed.data.profile) && {
          profile: {
            ...parsed.data.profile,
            ...(profileFieldsChanged && avatarCrop !== undefined ? { avatarCrop } : {}),
            ...(profileFieldsChanged ? { profileManuallyEdited: true } : {}),
          },
        }),
      });
    } catch (error) {
      if (isFileUniqueConstraintError(error, "noodle_accounts", ["handle"])) {
        return reply.code(409).send({ code: "NOODLE_HANDLE_TAKEN", error: "That Noodle handle is already in use." });
      }
      throw error;
    }
    if (!updated) return reply.code(404).send({ error: "Noodle account not found" });
    return updated;
  });

  app.patch("/accounts/:id/settings", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = noodleAccountSettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = await noodle.patchAccountSettings(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: "Noodle account not found" });
    return updated;
  });

  app.put("/noodler/accounts/:id/auto-post/schedule", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    const parsed = noodleAutoPostRescheduleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (Date.parse(parsed.data.nextRunAt) <= Date.now()) {
      return reply.code(400).send({ error: "Choose a future time for the next automatic post." });
    }
    const updated = await noodle.rescheduleAutoPostRun(id, parsed.data.nextRunAt);
    if (!updated) return reply.code(404).send({ error: "NoodleR stage profile not found" });
    return updated;
  });

  // Manual test trigger: runs one automatic-style post immediately, the same way the
  // scheduler does (subscriber access, no guide), without waiting for the next cadence
  // slot or requiring auto-posting to be enabled. Does not touch nextRunAt.
  app.post("/noodler/accounts/:id/auto-post/run-now", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const { id } = req.params as { id: string };
    try {
      const result = await generateAndApplyNoodlerPost(app.db, {
        mode: "noodler",
        targetAccountId: id,
        access: "subscriber",
      });
      // Run-now never sets reviewImagePromptsBeforeSend, so the generator can only return a
      // plain post here — no image-prompt review is ever produced on this path.
      if (result.status === "generated") return result.post;
      if (result.status === "busy") {
        return reply.code(409).send({ error: "A generation for this NoodleR account is already running." });
      }
      if (result.status === "connection_required") {
        return reply.code(400).send({ error: "Select a Noodle generation connection first." });
      }
      if (result.status === "connection_not_found") {
        return reply.code(404).send({ error: "Noodle generation connection not found" });
      }
      return reply.code(404).send({ error: "NoodleR account not found." });
    } catch (error) {
      logger.error(error, "[noodler] Manual run-now failed");
      return reply.code(500).send({ error: getErrorMessage(error) });
    }
  });

  // Global manual trigger: runs every automation-enabled creator (prioritizing those
  // scheduled soonest), consuming each selected creator's near-future slot the same way
  // an automatic run would. One creator's failure does not affect the others.
  app.post("/noodler/auto-post/refresh-now", async (_req, reply) => {
    const result = await refreshAllNoodlerCreatorsNow(app.db);
    if (result.status === "disabled") return reply.code(404).send({ error: "Not Found" });
    return { outcomes: result.outcomes };
  });

  app.patch("/accounts/:id/follows/:targetAccountId", async (req, reply) => {
    const { id, targetAccountId } = req.params as { id: string; targetAccountId: string };
    if (id === targetAccountId) return reply.code(400).send({ error: "A Noodle account cannot follow itself" });
    const parsed = noodleAccountFollowUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [account, target] = await Promise.all([noodle.getAccountById(id), noodle.getAccountById(targetAccountId)]);
    if (!account || !target) return reply.code(404).send({ error: "Noodle account not found" });
    const updated = await noodle.updateAccountFollow(id, targetAccountId, parsed.data.followed);
    if (!updated) return reply.code(404).send({ error: "Noodle account not found" });
    return updated.account;
  });

  app.post("/invites", async (req, reply) => {
    const parsed = noodleInviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await characters.getById(parsed.data.characterId);
    if (!row) return reply.code(404).send({ error: "Character not found" });
    const name = characterNameFromRow(row);
    return noodle.upsertAccountFromProfile({
      kind: "character",
      entityId: row.id,
      displayName: name,
      avatarUrl: row.avatarPath ?? null,
      avatarCrop: characterAvatarCrop(row),
      bio: String(parseRecord(row.data).description ?? ""),
      invited: true,
      syncIdentity: true,
    });
  });

  app.post("/invites/bulk", async (req, reply) => {
    const parsed = noodleBulkInviteSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const uniqueCharacterIds = Array.from(new Set(parsed.data.characterIds));
    const accounts: NoodleAccount[] = [];
    for (const characterId of uniqueCharacterIds) {
      const row = await characters.getById(characterId);
      if (!row) continue;
      accounts.push(
        await noodle.upsertAccountFromProfile({
          kind: "character",
          entityId: row.id,
          displayName: characterNameFromRow(row),
          avatarUrl: row.avatarPath ?? null,
          avatarCrop: characterAvatarCrop(row),
          bio: String(parseRecord(row.data).description ?? ""),
          invited: true,
          syncIdentity: true,
        }),
      );
    }
    return accounts;
  });

  app.delete("/invites", async () => {
    await Promise.all([
      noodle.clearCharacterInvites(),
      noodle.updateSettings({ invitedCharacterGroupIds: [], allowRandomUsers: false }),
    ]);
    return bootstrapVisibleNoodle(noodle, characters);
  });

  app.delete("/invites/:characterId", async (req, reply) => {
    const { characterId } = req.params as { characterId: string };
    const account = await noodle.setCharacterInvited(characterId, false);
    if (!account) return reply.code(404).send({ error: "Noodle character account not found" });
    return account;
  });

  app.post("/posts", async (req, reply) => {
    if (req.body && typeof req.body === "object" && "title" in req.body) {
      return reply.code(400).send({ error: "Public Noodle posts do not support titles." });
    }
    const parsed = noodleCreatePostSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let account = await noodle.getAccountByEntity(parsed.data.authorKind, parsed.data.authorEntityId);
    if (!account && parsed.data.authorKind === "persona") {
      account = await resolvePersonaAccount(noodle, characters, parsed.data.authorEntityId);
    }
    if (!account) return reply.code(404).send({ error: "Noodle account not found" });
    const mentionedAccounts = mentionedCharacterAccounts(await noodle.listAccounts(), parsed.data.content);
    const poll = parsed.data.poll ? createNoodlePoll(parsed.data.poll) : null;
    const post = await noodle.createPost({
      authorAccountId: account.id,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl ?? null,
      imagePrompt: parsed.data.imagePrompt ?? null,
      parentPostId: parsed.data.parentPostId ?? null,
      quotePostId: parsed.data.quotePostId ?? null,
      source: "manual",
      metadata: {
        ...mentionedAccountMetadata(mentionedAccounts),
        ...(poll ? { poll } : {}),
        ...(parsed.data.imageCrop ? { imageCrop: parsed.data.imageCrop } : {}),
      },
    });
    if (!post) return reply.code(404).send({ error: "Noodle author not found" });
    const digest = await noodle.createDigest({
      accountIds: [account.id, ...mentionedAccounts.map((mentionedAccount) => mentionedAccount.id)],
      content: `${noodleDigestAccountLabel(account)} posted on Noodle: ${post.content}`,
      sourcePostId: post.id,
    });
    return (await noodle.updatePostMedia(post.id, { metadata: { activityDigestId: digest.id } })) ?? post;
  });

  app.patch("/posts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (req.body && typeof req.body === "object" && "title" in req.body) {
      return reply.code(400).send({ error: "Public Noodle posts do not support titles." });
    }
    const parsed = noodlePostUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const existing = await noodle.getPostById(id);
    if (!existing) return reply.code(404).send({ error: "Noodle post not found" });
    const nextContent = parsed.data.content === undefined ? existing.content : parsed.data.content;
    const nextPoll =
      parsed.data.poll === undefined
        ? readNoodlePollFromMetadata(existing.metadata)
        : parsed.data.poll
          ? createNoodlePoll(parsed.data.poll)
          : null;
    if (!nextContent.trim() && !nextPoll) {
      return reply.code(400).send({ error: "Posts need a body or poll." });
    }
    let post = await noodle.updatePost(id, parsed.data);
    if (!post) return reply.code(404).send({ error: "Noodle post not found" });
    if (parsed.data.content !== undefined || parsed.data.poll !== undefined) {
      const mentionedAccounts = mentionedCharacterAccounts(await noodle.listAccounts(), post.content);
      post =
        (await noodle.updatePostMedia(post.id, {
          metadata: mentionedAccountMetadata(mentionedAccounts),
        })) ?? post;
      const digestId = post.metadata.activityDigestId;
      const author = await noodle.getAccountById(post.authorAccountId);
      const poll = readNoodlePollFromMetadata(post.metadata);
      const digestContent = post.content.trim() || poll?.question || "Shared a poll.";
      if (typeof digestId === "string" && digestId && author) {
        await noodle.updateDigest(digestId, {
          accountIds: [author.id, ...mentionedAccounts.map((mentionedAccount) => mentionedAccount.id)],
          content: `${noodleDigestAccountLabel(author)} posted on Noodle: ${digestContent}`,
        });
      }
    }
    return post;
  });

  app.delete("/posts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await noodle.deletePost(id);
    if (!deleted) return reply.code(404).send({ error: "Noodle post not found" });
    return deleted;
  });

  app.delete("/timeline", async () => {
    await noodle.resetTimeline();
    return bootstrapVisibleNoodle(noodle, characters);
  });

  app.post("/posts/:id/interactions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = noodleCreateInteractionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let actor = await noodle.getAccountByEntity(parsed.data.actorKind, parsed.data.actorEntityId);
    if (!actor && parsed.data.actorKind === "persona") {
      actor = await resolvePersonaAccount(noodle, characters, parsed.data.actorEntityId);
    }
    if (!actor) return reply.code(404).send({ error: "Noodle actor not found" });
    const post = await noodle.getPostById(id);
    if (!post) return reply.code(404).send({ error: "Noodle post not found" });
    if (parsed.data.type === "vote") {
      const poll = readNoodlePollFromMetadata(post.metadata);
      if (!poll || !poll.options.some((option) => option.id === parsed.data.content?.trim())) {
        return reply.code(400).send({ error: "Choose a valid option from this poll." });
      }
    }
    const interaction = await noodle.createInteraction(id, {
      actorAccountId: actor.id,
      type: parsed.data.type,
      content: parsed.data.content ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      parentInteractionId: parsed.data.parentInteractionId ?? null,
    });
    if (!interaction) return reply.code(400).send({ error: "Could not add that Noodle interaction." });
    if (parsed.data.type !== "like") {
      const directReplyTarget = parsed.data.parentInteractionId
        ? (await noodle.listInteractions([id])).find((item) => item.id === parsed.data.parentInteractionId)
        : null;
      const poll = readNoodlePollFromMetadata(post.metadata);
      const selectedPollOption =
        parsed.data.type === "vote"
          ? poll?.options.find((option) => option.id === interaction.content)?.label
          : undefined;
      const interactionSummary =
        parsed.data.type === "vote" && poll && selectedPollOption
          ? `${poll.question}: ${selectedPollOption}`
          : interaction.content || (interaction.imageUrl ? "shared an image" : post.content);
      await noodle.createDigest({
        accountIds: Array.from(
          new Set([actor.id, post.authorAccountId, directReplyTarget?.actorAccountId].filter(Boolean) as string[]),
        ),
        content: `${noodleDigestAccountLabel(actor)} ${interactionDigestVerb(parsed.data.type)} a Noodle post: ${interactionSummary}`,
        sourcePostId: post.id,
        sourceInteractionId: interaction.id,
      });
    }
    return interaction;
  });

  app.patch("/posts/:postId/interactions/:interactionId", async (req, reply) => {
    const { postId, interactionId } = req.params as { postId: string; interactionId: string };
    const parsed = noodleInteractionUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const interaction = await noodle.getInteractionById(interactionId);
    if (!interaction || interaction.postId !== postId) {
      return reply.code(404).send({ error: "Noodle comment not found" });
    }
    await ensurePersonaAccounts(noodle, characters);
    const persona = await noodle.getAccountByEntity("persona", parsed.data.personaId);
    if (!persona) return reply.code(404).send({ error: "Noodle persona not found" });
    const interactionActor = await noodle.getAccountById(interaction.actorAccountId);
    const actorKind = interactionActor?.kind ?? interaction.actorSnapshot?.kind;
    if (
      interaction.type !== "reply" ||
      !canManageNoodleReply({
        actorKind,
        actorAccountId: interaction.actorAccountId,
        personaAccountId: persona.id,
      })
    ) {
      return reply.code(403).send({ error: "You can only edit comments from this persona or a character." });
    }
    const content = parsed.data.content === undefined ? interaction.content : parsed.data.content?.trim() || null;
    const imageUrl = parsed.data.imageUrl === undefined ? interaction.imageUrl : parsed.data.imageUrl?.trim() || null;
    if (!content && !imageUrl) return reply.code(400).send({ error: "Comments need text or an image." });
    const updated = await noodle.updateInteraction(interactionId, { content, imageUrl });
    if (!updated) return reply.code(404).send({ error: "Noodle comment not found" });
    const [post, accounts] = await Promise.all([noodle.getPostById(postId), noodle.listAccounts()]);
    if (post && interactionActor) {
      const directReplyTarget = updated.parentInteractionId
        ? await noodle.getInteractionById(updated.parentInteractionId)
        : null;
      const mentionedAccounts = mentionedCharacterAccounts(accounts, updated.content ?? "");
      await noodle.createDigest({
        accountIds: Array.from(
          new Set(
            [
              interactionActor.id,
              post.authorAccountId,
              directReplyTarget?.actorAccountId,
              ...mentionedAccounts.map((account) => account.id),
            ].filter(Boolean) as string[],
          ),
        ),
        content: `${noodleDigestAccountLabel(interactionActor)} replied to a Noodle post: ${
          updated.content || (updated.imageUrl ? "shared an image" : post.content)
        }`,
        sourcePostId: post.id,
        sourceInteractionId: updated.id,
      });
    }
    return updated;
  });

  app.delete("/posts/:postId/interactions/:interactionId", async (req, reply) => {
    const { postId, interactionId } = req.params as { postId: string; interactionId: string };
    const parsed = noodleInteractionOwnerSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const interaction = await noodle.getInteractionById(interactionId);
    if (!interaction || interaction.postId !== postId) {
      return reply.code(404).send({ error: "Noodle comment not found" });
    }
    await ensurePersonaAccounts(noodle, characters);
    const persona = await noodle.getAccountByEntity("persona", parsed.data.personaId);
    if (!persona) return reply.code(404).send({ error: "Noodle persona not found" });
    const interactionActor = await noodle.getAccountById(interaction.actorAccountId);
    const actorKind = interactionActor?.kind ?? interaction.actorSnapshot?.kind;
    if (
      interaction.type !== "reply" ||
      !canManageNoodleReply({
        actorKind,
        actorAccountId: interaction.actorAccountId,
        personaAccountId: persona.id,
      })
    ) {
      return reply.code(403).send({ error: "You can only delete comments from this persona or a character." });
    }
    const deleted = await noodle.deleteInteractionById(interactionId);
    if (deleted.length === 0) return reply.code(404).send({ error: "Noodle comment not found" });
    return deleted;
  });

  app.delete("/posts/:id/interactions", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = noodleRemoveInteractionSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    let actor = await noodle.getAccountByEntity(parsed.data.actorKind, parsed.data.actorEntityId);
    if (!actor && parsed.data.actorKind === "persona") {
      actor = await resolvePersonaAccount(noodle, characters, parsed.data.actorEntityId);
    }
    if (!actor) return reply.code(404).send({ error: "Noodle actor not found" });
    const interaction = await noodle.deleteInteraction(id, {
      actorAccountId: actor.id,
      type: parsed.data.type,
      parentInteractionId: parsed.data.parentInteractionId ?? null,
    });
    if (!interaction) return reply.code(404).send({ error: "Noodle interaction not found" });
    return interaction;
  });

  app.post("/nudge", async (req, reply) => {
    const parsed = noodleNudgeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const settings = await noodle.getSettings();
    const connectionId = parsed.data.connectionId ?? settings.generationConnectionId;
    if (!connectionId) return reply.code(400).send({ error: "Select a Noodle generation connection first." });
    const conn = await connections.getWithKey(connectionId);
    if (!conn) return reply.code(404).send({ error: "Noodle generation connection not found" });

    const account = await noodle.getAccountById(parsed.data.accountId);
    if (!account) return reply.code(404).send({ error: "Noodle account not found" });
    if (account.kind !== "character") return reply.code(400).send({ error: "Only character accounts can be nudged." });

    const row = await characters.getById(account.entityId);
    if (!row) return reply.code(404).send({ error: "Character not found" });

    const personaAccount = await resolvePersonaAccount(noodle, characters, parsed.data.personaId);
    const debugMode = parsed.data.debugMode === true;
    const isReplyNudge = Boolean(parsed.data.targetPostId);
    const isFastMode = parsed.data.fastMode === true && !isReplyNudge;

    // For reply nudges: skip timeline captioning entirely — we only need to caption
    // the single target post image, done separately below.
    // For fast post nudges: skip everything (no captioning needed at all).
    // For normal post nudges: honour the user's captioning settings.
    const imageCaptioning = await resolveImageCaptioningRuntime({
      chatMeta: {
        imageCaptioningEnabled: (isReplyNudge || isFastMode) ? false : settings.imageCaptioningEnabled,
        imageCaptioningConnectionId: settings.imageCaptioningConnectionId,
      },
      fallbackConnectionId: connectionId,
      connections,
    });

    // Fast mode: build a lean context with only the character's own info + recent posts.
    // Skip buildRefreshPrompt entirely (no timeline scan, no lorebook, no chat context, no images).
    let nudgeFullMessages: ChatMessage[];
    let textOnlyMessages: ChatMessage[];
    if (isFastMode) {
      const charContext = characterContextFromRow(row);
      const personaRow = personaAccount ? await characters.getPersona(personaAccount.entityId) : null;
      const personaName = personaRow ? personaNameFromRow(personaRow) : (personaAccount?.displayName ?? "User");
      const tz = localScheduleTimezone();
      const nowStr = new Date().toLocaleString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
      });
      const scheduledActivityLines = (await chats.list()).flatMap((chat) => {
        const chatMeta = parseRecord(chat.metadata);
        const schedule = getEnabledConversationSchedules(chatMeta)[account.entityId] as WeekSchedule | undefined;
        const override = parseConversationStatusOverrides(chatMeta.conversationStatusOverrides)[account.entityId];
        if (!schedule && !override) return [];
        const current = getEffectiveCurrentStatus(schedule, override, new Date());
        const chatLabel = chat.name?.trim() ? ` in \"${chat.name.trim()}\"` : "";
        return [`- Scheduled activity${chatLabel}: ${current.activity} (status: ${current.status})`];
      });
      // Own recent posts only
      const recentCutoff = sinceHoursIso(48);
      const allRecent = await noodle.listPosts({ since: recentCutoff, limit: 50 });
      const ownPosts = allRecent.filter((p) => p.authorAccountId === account.id).slice(0, 10);
      const relatedPostIds = ownPosts.flatMap((post) => [post.parentPostId, post.quotePostId].filter((id): id is string => Boolean(id)));
      const [relatedPosts, postInteractions] = await Promise.all([
        Promise.all(relatedPostIds.map((id) => noodle.getPostById(id))),
        noodle.listInteractions(ownPosts.map((post) => post.id)),
      ]);
      const relatedPostById = new Map(
        relatedPosts.filter((post): post is NoodlePost => Boolean(post)).map((post) => [post.id, post]),
      );
      const formatPost = (post: NoodlePost) => {
        const author = post.authorSnapshot?.displayName ?? "Someone";
        const handle = post.authorSnapshot?.handle ? ` (@${post.authorSnapshot.handle})` : "";
        return `${author}${handle}: ${post.content.replace(/\s+/g, " ").trim().slice(0, 300)}`;
      };
      const ownPostLines = ownPosts.length > 0
        ? ownPosts.map((post) => {
            const related = [post.parentPostId, post.quotePostId]
              .map((id) => (id ? relatedPostById.get(id) : null))
              .filter((relatedPost): relatedPost is NoodlePost => Boolean(relatedPost));
            const interactionLines = postInteractions
              .filter((interaction) => interaction.postId === post.id && interaction.type === "reply" && interaction.content?.trim())
              .slice(0, 10)
              .map((interaction) => {
                const author = interaction.actorSnapshot?.displayName ?? "Someone";
                const handle = interaction.actorSnapshot?.handle ? ` (@${interaction.actorSnapshot.handle})` : "";
                return `  - ${author}${handle} replied: ${interaction.content!.replace(/\s+/g, " ").trim().slice(0, 300)}`;
              });
            return [
              `- ${formatPost(post)}`,
              ...related.map((relatedPost) => `  In response to: ${formatPost(relatedPost)}`),
              ...interactionLines,
            ].join("\n");
          }).join("\n")
        : "No recent posts.";
      const fastContext = [
        `# Current Time\n${nowStr}`,
        `# Character\n${charContext}`,
        ...(scheduledActivityLines.length > 0
          ? [`# Current Scheduled Activity\n${scheduledActivityLines.join("\n")}`]
          : []),
        `# User Persona\n${personaName}`,
        `# ${account.displayName}'s Recent Posts, Mentions, and Replies\n${ownPostLines}`,
      ].join("\n\n");
      const placeholderMsg: ChatMessage = { role: "user" as const, content: fastContext };
      nudgeFullMessages = [{ role: "system" as const, content: "" }, placeholderMsg];
      textOnlyMessages = nudgeFullMessages;
    } else {
      const result = await buildRefreshPrompt({
        db: app.db,
        noodle,
        characters,
        chats,
        promptOverrides,
        activeAccounts: [{ ...account }],
        personaAccount,
        settings,
        imageCaptioning,
      });
      nudgeFullMessages = result.messages;
      textOnlyMessages = result.textOnlyMessages;
    }

    // Reply mode: fetch the target post to include as context
    let replyTarget: { id: string; authorName: string; content: string; imageUrl: string | null } | null = null;
    if (parsed.data.targetPostId) {
      const targetPost = await noodle.getPostById(parsed.data.targetPostId);
      if (!targetPost) return reply.code(404).send({ error: "Target post not found." });
      const targetAccount = await noodle.getAccountById(targetPost.authorAccountId);
      replyTarget = {
        id: targetPost.id,
        authorName: targetAccount?.displayName ?? "someone",
        content: targetPost.content ?? "",
        imageUrl: typeof targetPost.imageUrl === "string" ? targetPost.imageUrl : null,
      };
    }

    const guidanceLine = parsed.data.prompt?.trim()
      ? `The ${replyTarget ? "reply" : "post"} should be about or inspired by: ${parsed.data.prompt.trim()}`
      : null;

    // Build the nudge-specific system prompt (replaces the normal refresh system prompt)
    const tz = localScheduleTimezone();
    const nowStr = new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz,
    });
    const imageInstruction = !replyTarget && settings.enableImagePrompts
      ? `image generation: you may include an imagePrompt if the post calls for a character image or meme. For character images, choose one clear visible-character viewpoint: selfie or mirror selfie (the character is visible holding the phone or in the reflection), a photo taken by a friend (the character is visible), or a back-facing or over-the-shoulder photo (the character is visible from behind). Do not use first-person POV, an empty scene, or an unseen camera operator's viewpoint unless the post explicitly asks for it. Default to casual phone selfies, mirror selfies, back-facing or over-the-shoulder photos, handheld candid shots, or photos taken by a friend. Use a tripod, studio, professional photographer, posed photoshoot, or polished commercial photography only when the character's occupation, wealth, setting, or post context makes that plausible. Vary framing and do not always show the character's face. Describe appearance, pose, setting, and mood. For memes describe format, visual gag, and caption. Omit or set null if a plain text post is more natural.`
      : null;

    const nudgeSystemPrompt = [
      replyTarget
        ? `You write exactly one in-character reply on Noodle for ${account.displayName} (@${account.handle}).`
        : `You write exactly one in-character post on Noodle for ${account.displayName} (@${account.handle}).`,
      NOODLE_ADULT_PLATFORM_POLICY,
      `Current date and time: ${nowStr}.`,
      "Use the context provided — recent timeline, chat context, character profile — to make the response feel natural and aware of what's happening right now.",
      ...(imageInstruction ? [imageInstruction] : []),
      "Return JSON only. No prose outside the JSON object.",
    ].join("\n");

    const postOutputExample = settings.enableImagePrompts && !replyTarget
      ? { authorHandle: account.handle, content: "post text here", imagePrompt: "optional image prompt or null" }
      : { authorHandle: account.handle, content: "post text here" };

    // Nudge guidance + output format go at the bottom for maximum recency weight
    const nudgeContext = [
      ...(replyTarget ? [`# Post to Reply To\n${replyTarget.authorName}: "${replyTarget.content.slice(0, 600)}"`] : []),
      ...(guidanceLine ? [`# Guidance\n${guidanceLine}`] : []),
      "# Your Task",
      replyTarget
        ? `Write exactly one reply to the post above as ${account.displayName} (@${account.handle}).`
        : `Write exactly one new post as ${account.displayName} (@${account.handle}).`,
      "",
      NOODLE_JSON_OUTPUT_HEADING,
      replyTarget
        ? JSON.stringify({ interactions: [{ actorHandle: account.handle, targetPostId: replyTarget.id, type: "reply", content: "reply text here" }] }, null, 2)
        : JSON.stringify({ posts: [postOutputExample] }, null, 2),
    ].join("\n");

    // Replace the system message from buildRefreshPrompt with our focused nudge system,
    // then append the nudge task at the bottom.
    const buildNudgeMessages = (base: ChatMessage[], targetImageDataUrl?: string | null) => {
      const [, ...rest] = base;
      const lastMsg: ChatMessage = targetImageDataUrl
        ? { role: "user" as const, content: nudgeContext, images: [targetImageDataUrl] }
        : { role: "user" as const, content: nudgeContext };
      return [
        { role: "system" as const, content: nudgeSystemPrompt },
        ...rest,
        lastMsg,
      ];
    };

    // Reply nudge: use text-only context (skip full timeline captioning) but attach
    // just the target post's single image for direct vision context, or generate a
    // caption if captioning is enabled (for models that don't support native vision).
    // Post nudge: use the full vision context from buildRefreshPrompt as-is.
    let nudgeMessages: ChatMessage[];
    let nudgeTextOnlyMessages: ChatMessage[];
    if (replyTarget) {
      let targetImageDataUrl: string | null = null;
      let targetImageCaption: string | null = null;
      if (replyTarget.imageUrl) {
        try {
          const [attachment] = await prepareNoodleVisionAttachments([{
            key: replyTarget.id,
            imageUrl: replyTarget.imageUrl,
            createdAt: new Date().toISOString(),
            postId: replyTarget.id,
            interactionId: null,
          }]);
          targetImageDataUrl = attachment?.dataUrl ?? null;
        } catch {
          // Non-critical — proceed without image
        }
        // Captioning enabled: generate a caption and use text-only (no native vision).
        // Captioning disabled: send the image natively with text-only fallback.
        // NOTE: check settings directly — imageCaptioning.enabled is false for reply
        // nudges because we disabled timeline captioning above.
        if (targetImageDataUrl && settings.imageCaptioningEnabled) {
          // Resolve a dedicated runtime for the single target-post image.
          const singleImageCaptioning = await resolveImageCaptioningRuntime({
            chatMeta: {
              imageCaptioningEnabled: true,
              imageCaptioningConnectionId: settings.imageCaptioningConnectionId,
            },
            fallbackConnectionId: connectionId,
            connections,
          });
          try {
            targetImageCaption = await generateImageCaptionForDataUrl(
              replyTarget.id,
              targetImageDataUrl,
              singleImageCaptioning,
              AbortSignal.timeout(60_000),
            );
          } catch {
            // Non-critical — proceed without caption
          }
          // Caption path: don't send image natively; the caption is the image representation.
          targetImageDataUrl = null;
        }
      }
      // Inject caption as text when available so both paths benefit from it.
      const replyNudgeContextWithCaption = targetImageCaption
        ? nudgeContext.replace(
            `# Post to Reply To\n${replyTarget.authorName}: "${replyTarget.content.slice(0, 600)}"`,
            `# Post to Reply To\n${replyTarget.authorName}: "${replyTarget.content.slice(0, 600)}"\n[Image description: ${targetImageCaption}]`,
          )
        : nudgeContext;
      const buildReplyMessages = (base: ChatMessage[], useImage: boolean) => {
        const [, ...rest] = base;
        const content = replyNudgeContextWithCaption;
        const lastMsg: ChatMessage =
          useImage && targetImageDataUrl
            ? { role: "user" as const, content, images: [targetImageDataUrl] }
            : { role: "user" as const, content };
        return [{ role: "system" as const, content: nudgeSystemPrompt }, ...rest, lastMsg];
      };
      // Caption mode: both primary and fallback use text-only (caption already in context).
      // Native vision mode: primary sends image, fallback strips it.
      nudgeMessages = buildReplyMessages(textOnlyMessages, true);
      nudgeTextOnlyMessages = buildReplyMessages(textOnlyMessages, false);
    } else {
      nudgeMessages = buildNudgeMessages(nudgeFullMessages);
      nudgeTextOnlyMessages = buildNudgeMessages(textOnlyMessages);
    }

    const baseUrl = resolveBaseUrl(conn);
    const provider = createLLMProvider(
      conn.provider, baseUrl, conn.apiKey, conn.maxContext,
      conn.openrouterProvider, conn.maxTokensOverride,
      conn.claudeFastMode === "true", conn.treatAsLocalEndpoint === "true",
    );
    const maxTokens = clampGenerationMaxOutputTokens({
      provider: conn.provider as APIProvider,
      model: conn.model,
      maxTokens: 1024,
      maxTokensOverride: conn.maxTokensOverride,
    });
    const result = await (async () => {
      try {
        return await provider.chatComplete(
          nudgeMessages,
          { model: conn.model, maxTokens, temperature: settings.generationTemperature, topP: settings.generationTopP, stream: false, debugMode, responseFormat: noodleResponseFormat(conn.model, "timeline") },
        );
      } catch (error) {
        if (!isUnsupportedNoodleVisionInputError(error)) throw error;
        logger.warn(error, "[noodle/nudge] Vision input rejected; retrying text-only");
        return provider.chatComplete(
          nudgeTextOnlyMessages,
          { model: conn.model, maxTokens, temperature: settings.generationTemperature, topP: settings.generationTopP, stream: false, debugMode, responseFormat: noodleResponseFormat(conn.model, "timeline") },
        );
      }
    })();
    logDebugOverride(debugMode, "[debug/noodle/nudge] response:\n%s", result.content ?? "");

    const generated = parseNoodleGeneratedRefreshResponse(result.content ?? "");

    if (replyTarget) {
      // Reply mode: create an interaction
      const interaction = generated.refresh.interactions[0];
      const replyContent = interaction?.content?.trim() ?? "";
      if (!replyContent) return reply.code(502).send({ error: "The model did not return a usable reply." });
      await noodle.createInteraction(replyTarget.id, {
        actorAccountId: account.id,
        type: "reply",
        content: replyContent,
        parentInteractionId: null,
      });
    } else {
      // Post mode: create a new post, then generate image if the model returned a prompt
      const post = generated.refresh.posts[0];
      if (!post || post.authorHandle.toLowerCase().replace(/[^a-z0-9_]/g, "") !== account.handle.toLowerCase().replace(/[^a-z0-9_]/g, "")) {
        return reply.code(502).send({ error: "The model did not return a usable post." });
      }
      const draftImagePrompt = normalizeNoodleImagePrompt(post.imagePrompt);
      let imageUrl: string | null = null;
      const mediaMetadata: Record<string, unknown> = {};
      if (draftImagePrompt && settings.enableImagePrompts) {
        const imageConnection = settings.imageGenerationConnectionId
          ? await connections.getWithKey(settings.imageGenerationConnectionId)
          : await connections.getDefaultForImageGeneration();
        if (imageConnection) {
          try {
            const generatedImage = await generateNoodlePostImage({
              account,
              referenceAccounts: [account],
              postContent: post.content,
              draftPrompt: draftImagePrompt,
              settings,
              characters,
              characterGallery,
              promptOverrides,
              imageConnection,
              promptConnection: conn,
              app,
              debugMode,
            });
            imageUrl = generatedImage.imageUrl;
            Object.assign(mediaMetadata, generatedImage.metadata);
          } catch (err) {
            logger.warn(err, "[noodle/nudge] Image generation failed for %s", account.displayName);
          }
        }
      }
      const mentionedAccounts = mentionedCharacterAccounts(await noodle.listAccounts(), post.content);
      const createdPost = await noodle.createPost({
        authorAccountId: account.id,
        content: post.content,
        imagePrompt: draftImagePrompt,
        imageUrl,
        source: "generated",
        metadata: { nudged: true, nudgePrompt: parsed.data.prompt ?? null, ...mediaMetadata, ...mentionedAccountMetadata(mentionedAccounts) },
      });
      if (!createdPost) return reply.code(500).send({ error: "Failed to save the post." });
    }

    return bootstrapVisibleNoodle(noodle, characters);
  });

  app.post("/refresh/images", async (req, reply) => {
    const parsed = noodleImagePromptConfirmationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const settings = await noodle.getSettings();
    const imageConnection = settings.imageGenerationConnectionId
      ? await connections.getWithKey(settings.imageGenerationConnectionId)
      : await connections.getDefaultForImageGeneration();
    if (!imageConnection) return reply.code(400).send({ error: "Select a Noodle image generation connection first." });
    const confirmPromptConnection = settings.generationConnectionId
      ? await connections.getWithKey(settings.generationConnectionId)
      : null;

    for (const promptOverride of parsed.data.prompts) {
      const post = await noodle.getPostById(promptOverride.id);
      if (!post || !post.imagePrompt || post.imageUrl) continue;
      const account = await noodle.getAccountById(post.authorAccountId);
      if (!account) continue;
      try {
        const generatedImage = await generateNoodlePostImage({
          account,
          referenceAccounts: [account],
          postContent: post.content,
          draftPrompt: post.imagePrompt,
          settings,
          characters,
          characterGallery,
          promptOverrides,
          imageConnection,
          promptConnection: confirmPromptConnection,
          app,
          debugMode: parsed.data.debugMode === true,
          promptOverride,
        });
        await noodle.updatePostMedia(post.id, {
          imageUrl: generatedImage.imageUrl,
          metadata: generatedImage.metadata,
        });
      } catch (error) {
        logger.warn(error, "[noodle] Failed to generate reviewed image for %s", account.displayName);
        await noodle.updatePostMedia(post.id, {
          imageUrl: null,
          imagePrompt: null,
          metadata: {
            imageGenerationFailed: true,
            imageGenerationError: getErrorMessage(error).slice(0, 500),
          },
        });
      }
    }

    return bootstrapVisibleNoodle(noodle, characters);
  });

  app.post("/noodler/refresh/images", async (req, reply) => {
    const settings = await noodle.getSettings();
    if (!settings.enableNoodler) return reply.code(404).send({ error: "Not Found" });
    const parsed = noodleImagePromptConfirmationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const result = await noodlerImages.generateReviewedImages({
      prompts: parsed.data.prompts,
      debugMode: parsed.data.debugMode === true,
    });
    if (!result.ok) return reply.code(400).send({ error: result.message });
    return { finalized: result.finalized };
  });

  app.post("/refresh", async (req, reply) => {
    let decoded: DecodedNoodlerMediaRequest<
      z.output<typeof noodlerGenerationRequestSchema> | z.output<typeof noodleGenerationRequestSchema>
    >;
    try {
      decoded = await decodeNoodlerMediaRequest(req, {
        withMedia: noodlerGenerationRequestSchema,
        withoutMedia: noodleGenerationRequestSchema,
      });
    } catch (error) {
      return sendNoodlerMediaError(reply, error);
    }
    if (!decoded.success) return reply.code(400).send({ error: decoded.error.flatten() });
    if (decoded.data.mode === "noodler") {
      try {
        const result = await generateAndApplyNoodlerPost(app.db, decoded.data, decoded.media);
        if (result.status === "generated") {
          return result.imagePromptReview
            ? { ...result.post, imagePromptReview: result.imagePromptReview }
            : result.post;
        }
        if (result.status === "disabled") return reply.code(404).send({ error: "Not Found" });
        if (result.status === "busy") {
          return reply.code(409).send({ error: "A generation for this NoodleR account is already running." });
        }
        if (result.status === "connection_required") {
          return reply.code(400).send({ error: "Select a Noodle generation connection first." });
        }
        if (result.status === "connection_not_found") {
          return reply.code(404).send({ error: "Noodle generation connection not found" });
        }
        return reply.code(404).send({ error: "NoodleR account not found." });
      } catch (error) {
        logger.error(error, "[noodler] NoodleR post generation failed");
        return reply.code(500).send({ error: getErrorMessage(error) });
      }
    }
    const settings = await noodle.getSettings();
    const connectionId = decoded.data.connectionId ?? settings.generationConnectionId;
    if (!connectionId) return reply.code(400).send({ error: "Select a Noodle generation connection first." });
    const conn = await connections.getWithKey(connectionId);
    if (!conn) return reply.code(404).send({ error: "Noodle generation connection not found" });
    const imageCaptioning = await resolveImageCaptioningRuntime({
      chatMeta: settings.imageCaptioningUseConnectionDefault
        ? {}
        : {
            imageCaptioningEnabled: settings.imageCaptioningEnabled,
            imageCaptioningConnectionId: settings.imageCaptioningConnectionId,
          },
      fallbackConnectionId: connectionId,
      connections,
    });
    const imageConnection = settings.enableImagePrompts
      ? settings.imageGenerationConnectionId
        ? await connections.getWithKey(settings.imageGenerationConnectionId)
        : await connections.getDefaultForImageGeneration()
      : null;
    if (settings.enableImagePrompts && !imageConnection) {
      return reply.code(400).send({ error: "Select a Noodle image generation connection first." });
    }
    if (refreshInFlight) {
      return reply.code(409).send({ error: "A Noodle timeline refresh is already running." });
    }
    refreshInFlight = true;

    const debugMode = decoded.data.debugMode === true;
    const reviewImagePromptsBeforeSend =
      decoded.data.mode === "public" && decoded.data.reviewImagePromptsBeforeSend === true;
    const personaId = decoded.data.mode === "public" ? decoded.data.personaId : undefined;
    let run: Awaited<ReturnType<typeof noodle.createRefreshRun>> | null = null;

    try {
      const baseUrl = resolveBaseUrl(conn);
      const primaryProvider = createLLMProvider(
        conn.provider,
        baseUrl,
        conn.apiKey,
        conn.maxContext,
        conn.openrouterProvider,
        conn.maxTokensOverride,
        conn.claudeFastMode === "true",
        conn.treatAsLocalEndpoint === "true",
        conn.defaultParameters,
      );
      const fallbackConnection = await connections.getFallbackForMain();
      const provider = withConnectionFallbackProvider({
        primary: primaryProvider,
        primaryConnectionId: conn.id,
        fallbackConnection,
        fallbackBaseUrl: fallbackConnection ? resolveBaseUrl(fallbackConnection) : "",
        category: "main",
      });
      await ensurePersonaAccounts(noodle, characters);
      if (settings.allowProfessorMari) await ensureProfessorMariAccount(noodle, characters);
      const personaAccount = await resolvePersonaAccount(noodle, characters, personaId);
      const selectedGroupCharacterIds = await ensureSelectedGroupCharacterAccounts(
        noodle,
        characters,
        settings.invitedCharacterGroupIds,
      );
      if (settings.allowRandomUsers) await ensureRandomUserAccounts(noodle);
      const participantAccounts = await noodle.listAccounts();
      const selectionCutoff = sinceHoursIso(48);
      const [recentCreatedSelectionPosts, recentPersonaSelectionReplies] = await Promise.all([
        noodle.listPosts({ since: selectionCutoff, limit: 200 }),
        personaAccount ? noodle.listRepliesByActorSince(personaAccount.id, selectionCutoff, 200) : Promise.resolve([]),
      ]);
      const personaSelectionPostIds = Array.from(
        new Set(recentPersonaSelectionReplies.map((interaction) => interaction.postId)),
      );
      const personaSelectionPosts = (
        await Promise.all(personaSelectionPostIds.map((postId) => noodle.getPostById(postId)))
      ).filter((post): post is NoodlePost => Boolean(post));
      const recentSelectionPosts = [
        ...new Map([...recentCreatedSelectionPosts, ...personaSelectionPosts].map((post) => [post.id, post])).values(),
      ];
      const [recentSelectionInteractions, recentCompletedRuns] = await Promise.all([
        noodle.listInteractions(recentSelectionPosts.map((post) => post.id)),
        noodle.listRefreshRuns({ status: "completed", limit: 1 }),
      ]);
      const priorityAccountIds = collectNoodlePriorityAccountIds({
        accounts: participantAccounts,
        posts: recentSelectionPosts,
        interactions: recentSelectionInteractions,
        personaAccount,
      });
      let selectedParticipants = chooseNoodleParticipantAccounts({
        accounts: participantAccounts,
        settings,
        selectedGroupCharacterIds,
        followedAccountIds: new Set(personaAccount?.settings.social.followingAccountIds ?? []),
        recentlyActiveAccountIds: new Set(recentCompletedRuns[0]?.activeAccountIds ?? []),
        priorityAccountIds,
      });
      if (selectedParticipants.length === 0) {
        return reply
          .code(400)
          .send({ error: "Invite a character, select a character folder, or enable random users before refreshing." });
      }

      await generateMissingNoodleProfiles({
        noodle,
        characters,
        characterGallery,
        accounts: selectedParticipants,
        provider,
        connection: conn,
        debugMode,
      });
      selectedParticipants = (
        await Promise.all(selectedParticipants.map((account) => noodle.getAccountById(account.id)))
      ).filter((account): account is NoodleAccount => account !== null);

      const activeAccounts = [...selectedParticipants, ...(personaAccount ? [personaAccount] : [])];
      const {
        messages,
        textOnlyMessages,
        promptForLog,
        textOnlyPromptForLog,
        visionAttachmentCount,
        captionedImageCount,
        recalledPostIds,
        lorebookActivatedEntryIds,
      } = await buildRefreshPrompt({
        db: app.db,
        noodle,
        characters,
        chats,
        promptOverrides,
        activeAccounts: selectedParticipants,
        personaAccount,
        settings,
        imageCaptioning,
      });
      logDebugOverride(debugMode, "[debug/noodle] Prompt sent to model:\n%s", promptForLog);
      if (visionAttachmentCount > 0) {
        logDebugOverride(
          debugMode,
          "[debug/noodle] Attached %d timeline image input(s) to the refresh prompt",
          visionAttachmentCount,
        );
      }
      if (captionedImageCount > 0) {
        logDebugOverride(
          debugMode,
          "[debug/noodle] Added %d generated timeline image caption(s) to the refresh prompt",
          captionedImageCount,
        );
      }
      if (lorebookActivatedEntryIds.length > 0) {
        logDebugOverride(
          debugMode,
          "[debug/noodle] Activated %d lorebook entr(ies) for this refresh: %s",
          lorebookActivatedEntryIds.length,
          lorebookActivatedEntryIds.join(", "),
        );
      }
      run = await noodle.createRefreshRun({
        activeAccountIds: activeAccounts.map((account) => account.id),
        prompt: promptForLog,
      });
      const runId = run.id;
      const timelineMaxTokens = clampGenerationMaxOutputTokens({
        provider: conn.provider as APIProvider,
        model: conn.model,
        maxTokens: timelineRefreshMaxTokens(
          selectedParticipants.filter((account) => account.kind === "character").length,
        ),
        maxTokensOverride: conn.maxTokensOverride,
      });
      const reasoningEffort = resolveProviderReasoningEffort({
        provider: conn.provider,
        model: conn.model,
        reasoningEffort: settings.generationReasoningEffort,
      });
      const completionOptions = {
        model: conn.model,
        maxTokens: timelineMaxTokens,
        temperature: settings.generationTemperature,
        topP: settings.generationTopP,
        reasoningEffort: reasoningEffort ?? undefined,
        stream: false,
        debugMode,
        responseFormat: noodleResponseFormat(conn.model, "timeline"),
      } as const;
      let requestMessages: ChatMessage[] = messages;
      let firstAttemptKind: NoodleRefreshAttemptKind = "initial";
      let result: Awaited<ReturnType<typeof provider.chatComplete>>;
      try {
        result = await provider.chatComplete(messages, completionOptions);
      } catch (error) {
        if (visionAttachmentCount === 0 || !isUnsupportedNoodleVisionInputError(error)) throw error;
        logger.warn(
          error,
          "[noodle/vision] The selected timeline model rejected image input; retrying the refresh as text-only",
        );
        logDebugOverride(
          debugMode,
          "[debug/noodle] Text-only fallback prompt sent to model:\n%s",
          textOnlyPromptForLog,
        );
        requestMessages = textOnlyMessages;
        firstAttemptKind = "text_only_fallback";
        result = await provider.chatComplete(textOnlyMessages, completionOptions);
      }
      let content = result.content ?? "";
      logDebugOverride(
        debugMode,
        "[debug/noodle] Raw model response (%s attempt %d):\n%s",
        firstAttemptKind,
        1,
        content,
      );
      let parsedGenerated: ReturnType<typeof parseNoodleGeneratedRefresh> | null = null;
      let retryReason: string | null = null;
      const allowedActorHandles = new Set(selectedParticipants.map((account) => normalizeNoodleHandle(account.handle)));
      const knownHandles = new Set(activeAccounts.map((account) => normalizeNoodleHandle(account.handle)));
      try {
        parsedGenerated = parseNoodleGeneratedRefreshResponse(content);
        retryReason = validateNoodleGeneratedRefresh(parsedGenerated.refresh, allowedActorHandles, knownHandles);
      } catch (error) {
        retryReason = `the response was not valid timeline JSON (${getErrorMessage(error)})`;
      }
      await noodle.recordRefreshAttempt(runId, {
        sequence: 1,
        kind: firstAttemptKind,
        response: content,
        rejectionReason: retryReason,
        createdAt: new Date().toISOString(),
      });

      if (retryReason) {
        const allowedHandles = selectedParticipants.map((account) => `@${account.handle}`);
        const knownTargetHandles = activeAccounts.map((account) => `@${account.handle}`);
        logger.warn("[noodle] Retrying timeline generation because %s", retryReason);
        const correction = [
          "Your previous timeline response could not be used.",
          `Reason: ${retryReason}.`,
          `Regenerate the complete JSON object now. Authors and actors must use only these selected participant handles: ${allowedHandles.join(", ")}.`,
          `Follow targets may additionally use these known handles: ${knownTargetHandles.join(", ")}.`,
          "Do not invent, rename, or omit an authorHandle, actorHandle, or targetHandle. Return JSON only.",
        ].join("\n");
        result = await provider.chatComplete([...requestMessages, { role: "user", content: correction }], completionOptions);
        content = result.content ?? "";
        logDebugOverride(
          debugMode,
          "[debug/noodle] Raw model response (%s attempt %d):\n%s",
          "correction",
          2,
          content,
        );
        parsedGenerated = null;
        let correctedRetryReason: string | null = null;
        try {
          parsedGenerated = parseNoodleGeneratedRefreshResponse(content);
          correctedRetryReason = validateNoodleGeneratedRefresh(
            parsedGenerated.refresh,
            allowedActorHandles,
            knownHandles,
          );
        } catch (error) {
          correctedRetryReason = `the response was not valid timeline JSON (${getErrorMessage(error)})`;
        }
        await noodle.recordRefreshAttempt(runId, {
          sequence: 2,
          kind: "correction",
          response: content,
          rejectionReason: correctedRetryReason,
          createdAt: new Date().toISOString(),
        });
        if (correctedRetryReason) {
          throw new Error(`Noodle timeline correction could not be used because ${correctedRetryReason}.`);
        }
      }

      if (!parsedGenerated) throw new Error("Noodle timeline generation returned no usable response.");
      const generated = parsedGenerated.refresh;
      for (const rejected of parsedGenerated.rejected) {
        logger.warn(
          "[noodle] Ignoring malformed generated %s item at index %d (%d validation issue%s)",
          rejected.collection,
          rejected.index,
          rejected.issueCount,
          rejected.issueCount === 1 ? "" : "s",
        );
      }
      const handleToAccount = new Map(
        [...(personaAccount ? [personaAccount] : []), ...selectedParticipants].map((account) => [
          normalizeNoodleHandle(account.handle),
          account,
        ]),
      );
      const freshPosts = await noodle.listPosts({ since: sinceHoursIso(48), limit: 200 });
      const allowedExistingPostIds = new Set([...freshPosts.map((post) => post.id), ...recalledPostIds]);
      const existingInteractionById = new Map(
        (await noodle.listInteractions([...allowedExistingPostIds])).map((interaction) => [
          interaction.id,
          interaction,
        ]),
      );
      const existingInteractions = [...existingInteractionById.values()];
      let remainingImagePrompts = settings.enableImagePrompts ? settings.maxImagesPerRefresh : 0;
      const tempIdToPostId = new Map<string, string>();
      const createdPostIds: string[] = [];
      const imagePromptReviewItems: Array<{
        id: string;
        kind: "illustration";
        title: string;
        prompt: string;
        negativePrompt?: string;
        width: number;
        height: number;
      }> = [];
      const activeCharacterReferenceAccounts = activeAccounts.filter((account) => account.kind === "character");

      for (const generatedPost of generated.posts.slice(0, settings.maxGeneratedPostsPerRefresh)) {
        const account = handleToAccount.get(normalizeNoodleHandle(generatedPost.authorHandle));
        if (!account) continue;
        if (!canGenerateNoodleActivityForAccountKind(account.kind)) {
          logger.warn("[noodle] Ignoring generated post attributed to persona %s", account.entityId);
          continue;
        }
        const imagePrompt =
          remainingImagePrompts > 0 ? normalizeNoodleImagePrompt(generatedPost.imagePrompt) : null;
        if (imagePrompt) remainingImagePrompts -= 1;
        let persistedImagePrompt = imagePrompt;
        let imageUrl: string | null = null;
        const mediaMetadata: Record<string, unknown> = {};
        let imageGenerationFailed = false;
        let imagePromptPreview: Omit<(typeof imagePromptReviewItems)[number], "id"> | null = null;
        if (imagePrompt && imageConnection) {
          try {
            const generatedImage = await generateNoodlePostImage({
              account,
              referenceAccounts: activeCharacterReferenceAccounts,
              postContent: generatedPost.content,
              draftPrompt: imagePrompt,
              settings,
              characters,
              characterGallery,
              promptOverrides,
              imageConnection,
              promptConnection: conn,
              app,
              debugMode,
              previewOnly: reviewImagePromptsBeforeSend,
            });
            imageUrl = generatedImage.imageUrl;
            Object.assign(mediaMetadata, generatedImage.metadata);
            imagePromptPreview = generatedImage.preview;
          } catch (err) {
            logger.warn(err, "[noodle] Failed to generate image for %s", account.displayName);
            persistedImagePrompt = null;
            imageGenerationFailed = true;
            mediaMetadata.imageGenerationFailed = true;
            mediaMetadata.imageGenerationError = getErrorMessage(err).slice(0, 500);
          }
        } else if (imagePrompt) {
          persistedImagePrompt = null;
          imageGenerationFailed = true;
          mediaMetadata.imageGenerationFailed = true;
          mediaMetadata.imageGenerationError = "No image generation connection is configured.";
        }
        if (
          !imageUrl &&
          !imagePromptPreview &&
          !imageGenerationFailed &&
          settings.allowGalleryImageAttachments &&
          generatedPost.attachGalleryImage === true
        ) {
          try {
            const attachment = await pickGalleryAttachmentForAccount({ account, chats, gallery, characterGallery });
            if (attachment) {
              imageUrl = attachment.imageUrl;
              Object.assign(mediaMetadata, attachment.metadata);
            }
          } catch (err) {
            logger.warn(err, "[noodle] Failed to attach gallery image for %s", account.displayName);
          }
        }
        const mentionedAccounts = mentionedCharacterAccounts(activeAccounts, generatedPost.content);
        const poll = generatedPost.poll ? createNoodlePoll(generatedPost.poll) : null;
        const post = await noodle.createPost({
          authorAccountId: account.id,
          content: generatedPost.content,
          imagePrompt: persistedImagePrompt,
          imageUrl,
          source: "generated",
          metadata: {
            runId,
            ...mediaMetadata,
            ...mentionedAccountMetadata(mentionedAccounts),
            ...(poll ? { poll } : {}),
          },
        });
        if (!post) continue;
        createdPostIds.push(post.id);
        if (imagePromptPreview) imagePromptReviewItems.push({ id: post.id, ...imagePromptPreview });
        if (generatedPost.tempId) tempIdToPostId.set(generatedPost.tempId, post.id);
        const digest = await noodle.createDigest({
          accountIds: [account.id, ...mentionedAccounts.map((mentionedAccount) => mentionedAccount.id)],
          content: `${noodleDigestAccountLabel(account)} posted on Noodle: ${post.content}`,
          sourceRunId: runId,
          sourcePostId: post.id,
        });
        await noodle.updatePostMedia(post.id, { metadata: { activityDigestId: digest.id } });
      }

      const quotas: Record<NoodleInteractionType, number> = {
        like: settings.maxLikesPerRefresh,
        repost: settings.maxRepostsPerRefresh,
        reply: settings.maxRepliesPerRefresh,
        vote: settings.maxLikesPerRefresh,
      };
      for (const generatedInteraction of generated.interactions) {
        if (quotas[generatedInteraction.type] <= 0) continue;
        const actor = handleToAccount.get(normalizeNoodleHandle(generatedInteraction.actorHandle));
        if (!actor) continue;
        if (!canGenerateNoodleActivityForAccountKind(actor.kind)) {
          logger.warn(
            "[noodle] Ignoring generated %s interaction attributed to persona %s",
            generatedInteraction.type,
            actor.entityId,
          );
          continue;
        }
        const targetPostId =
          generatedInteraction.targetPostId ?? tempIdToPostId.get(generatedInteraction.targetTempId ?? "");
        if (!targetPostId || (!allowedExistingPostIds.has(targetPostId) && !createdPostIds.includes(targetPostId))) {
          continue;
        }
        const targetPost = await noodle.getPostById(targetPostId);
        if (!targetPost) continue;
        const parentInteraction = generatedInteraction.parentInteractionId
          ? (existingInteractionById.get(generatedInteraction.parentInteractionId) ?? null)
          : null;
        if (
          generatedInteraction.parentInteractionId &&
          (!parentInteraction || parentInteraction.postId !== targetPostId || parentInteraction.type !== "reply")
        ) {
          continue;
        }
        if (
          !canCreateGeneratedNoodleInteraction({
            actor,
            targetPost,
            parentInteraction,
            existingInteractions,
          })
        ) {
          continue;
        }
        const poll = readNoodlePollFromMetadata(targetPost.metadata);
        const selectedPollOption =
          generatedInteraction.type === "vote" ? poll?.options[generatedInteraction.pollOptionIndex ?? -1] : undefined;
        if (generatedInteraction.type === "vote" && !selectedPollOption) continue;
        const interaction = await noodle.createInteraction(targetPostId, {
          actorAccountId: actor.id,
          type: generatedInteraction.type,
          content: selectedPollOption?.id ?? generatedInteraction.content ?? null,
          parentInteractionId: parentInteraction?.id ?? null,
        });
        if (!interaction) continue;
        existingInteractions.push(interaction);
        existingInteractionById.set(interaction.id, interaction);
        quotas[generatedInteraction.type] -= 1;
        if (generatedInteraction.type !== "like") {
          const interactionSummary =
            generatedInteraction.type === "vote" && poll && selectedPollOption
              ? `${poll.question}: ${selectedPollOption.label}`
              : interaction.content || targetPost.content;
          await noodle.createDigest({
            accountIds: Array.from(
              new Set([actor.id, targetPost.authorAccountId, parentInteraction?.actorAccountId]),
            ).filter((accountId): accountId is string => Boolean(accountId)),
            content: `${noodleDigestAccountLabel(actor)} ${interactionDigestVerb(
              generatedInteraction.type,
            )} a Noodle post: ${interactionSummary}`,
            sourceRunId: runId,
            sourcePostId: targetPostId,
            sourceInteractionId: interaction.id,
          });
        }
      }

      const maxGeneratedFollows = Math.max(12, activeAccounts.length * 2);
      const seenGeneratedFollows = new Set<string>();
      for (const generatedFollow of generated.follows.slice(0, maxGeneratedFollows)) {
        const actor = handleToAccount.get(normalizeNoodleHandle(generatedFollow.actorHandle));
        const target = handleToAccount.get(normalizeNoodleHandle(generatedFollow.targetHandle));
        if (!actor || !target || actor.id === target.id) continue;
        if (!canGenerateNoodleActivityForAccountKind(actor.kind)) {
          logger.warn("[noodle] Ignoring generated follow attributed to persona %s", actor.entityId);
          continue;
        }
        const followKey = `${actor.id}:${target.id}`;
        if (seenGeneratedFollows.has(followKey)) continue;
        seenGeneratedFollows.add(followKey);
        const follow = await noodle.updateAccountFollow(actor.id, target.id, true);
        if (!follow?.changed) continue;
        await noodle.createDigest({
          accountIds: [actor.id, target.id],
          content: `${noodleDigestAccountLabel(actor)} followed ${noodleDigestAccountLabel(target)} on Noodle.`,
          sourceRunId: runId,
        });
      }

      await noodle.finishRefreshRun(runId, { status: "completed", result: content });
      return {
        bootstrap: await bootstrapVisibleNoodle(noodle, characters),
        imagePromptReviewItems,
      };
    } catch (error) {
      logger.error(error, "[noodle] Timeline refresh failed");
      if (run) await noodle.finishRefreshRun(run.id, { status: "failed", error: getErrorMessage(error) });
      return reply.code(500).send({ error: getErrorMessage(error) });
    } finally {
      refreshInFlight = false;
    }
  });
}
