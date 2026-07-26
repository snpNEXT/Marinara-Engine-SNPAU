import {
  NOODLE_PRIVATE_POST_CONTENT_MAX_LENGTH,
  NOODLE_PRIVATE_POST_TITLE_MAX_LENGTH,
  createNoodlePoll,
  noodleGeneratedPrivatePostSchema,
  type APIProvider,
  type NoodleAccount,
  type NoodleIdentityDisclosure,
  type NoodlePrivateGenerationRequest,
  type NoodleStageProfileInput,
  type NoodlerManagedPost,
} from "@marinara-engine/shared";
import { isDebugAgentsEnabled } from "../../config/runtime-config.js";
import { newId } from "../../utils/id-generator.js";
import type { DB } from "../../db/connection.js";
import { logger, logDebugOverride } from "../../lib/logger.js";
import { resolveBaseUrl } from "../generation/connection-base-url.js";
import { resolveStoredChatOptions, resolveStoredMaxTokens } from "../generation/generation-parameters.js";
import { clampGenerationMaxOutputTokens } from "../generation/output-token-limits.js";
import { parseGameJsonish } from "../game/jsonish.js";
import { withConnectionFallbackProvider } from "../llm/connection-fallback-provider.js";
import type { ChatMessage } from "../llm/base-provider.js";
import { createLLMProvider } from "../llm/provider-registry.js";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createNoodleStorage } from "../storage/noodle.storage.js";
import { createPromptOverridesStorage } from "../storage/prompt-overrides.storage.js";
import { formatNoodleMessagesForLog } from "./noodle-generation-log.js";
import { generatePrivatePostImage } from "./noodle-private-images.service.js";
import {
  persistPrivatePostWithUploadedMedia,
  privatePostMediaUrl,
  type NoodlerPrivatePostMediaUpload,
} from "./noodle-private-media.js";
import type { NoodleImagePromptReviewItem } from "./noodle-public-images.service.js";
import { getErrorMessage } from "./noodle-public-support.js";
import { noodleResponseFormat } from "./noodle-response-format.js";

export type GeneratedPrivatePostResult = {
  post: NoodlerManagedPost;
  imagePromptReview: NoodleImagePromptReviewItem | null;
};

type GenerationConnection = NonNullable<Awaited<ReturnType<ReturnType<typeof createConnectionsStorage>["getWithKey"]>>>;

export type PrivatePostGenerationInput = {
  account: NoodleAccount;
  request: NoodlePrivateGenerationRequest;
  connection: GenerationConnection;
  media?: NoodlerPrivatePostMediaUpload;
};

const PRIVATE_POST_MAX_TOKENS = 2048;

type PublicIdentity = { displayName: string; handle: string };

function identityInstruction(mode: NoodleIdentityDisclosure, publicIdentity: PublicIdentity | null): string {
  if (mode === "open" && publicIdentity) {
    return `Disclosure is open. The linked public identity ${publicIdentity.displayName} (@${publicIdentity.handle}) may be named.`;
  }
  if (mode === "hinted") {
    return "Disclosure is hinted. General allusions to another public persona are allowed, but never use its exact name or handle.";
  }
  return "Disclosure is secret. Do not mention, imply, or identify any linked public persona.";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function containsIdentity(value: string, identifier: string): boolean {
  if (!identifier.trim()) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@?${escapeRegExp(identifier.trim())}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(value);
}

export function stageProfileContainsPublicIdentity(
  profile: NoodleStageProfileInput,
  publicIdentity: PublicIdentity,
): boolean {
  if (profile.disclosureMode === "open") return false;
  const values = [profile.displayName, profile.handle, profile.bio, profile.stagePersonality];
  return values.some(
    (value) => containsIdentity(value, publicIdentity.displayName) || containsIdentity(value, publicIdentity.handle),
  );
}

export function protectPrivateGeneratedIdentity(
  value: string | null | undefined,
  mode: NoodleIdentityDisclosure,
  publicIdentity: PublicIdentity | null,
): string | null {
  if (!value?.trim()) return null;
  if (mode === "open" || !publicIdentity) return value.trim();
  const protectedValues = [publicIdentity.displayName.trim(), publicIdentity.handle.trim()]
    .filter((item, index, values) => item.length > 0 && values.indexOf(item) === index)
    .sort((left, right) => right.length - left.length);
  const replacement = mode === "hinted" ? "a public persona" : "someone";
  return protectedValues
    .reduce(
      (current, identifier) =>
        current.replace(
          new RegExp(`(^|[^\\p{L}\\p{N}_])@?${escapeRegExp(identifier)}(?=$|[^\\p{L}\\p{N}_])`, "giu"),
          (_match, prefix: string) => `${prefix}${replacement}`,
        ),
      value,
    )
    .replace(new RegExp(`(?:${replacement})(?:\\s*\\(@?${replacement}\\))?`, "giu"), replacement)
    .trim();
}

function protectBoundedPrivateGeneratedText(
  value: string | null | undefined,
  mode: NoodleIdentityDisclosure,
  publicIdentity: PublicIdentity | null,
  maxLength: number,
): string | null {
  const protectedValue = protectPrivateGeneratedIdentity(value, mode, publicIdentity);
  if (!protectedValue || protectedValue.length <= maxLength) return protectedValue;
  const lastCodeUnit = protectedValue.charCodeAt(maxLength - 1);
  const safeEnd = lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? maxLength - 1 : maxLength;
  return protectedValue.slice(0, safeEnd).trimEnd();
}

function formatPrivatePostHistory(posts: NoodlerManagedPost[], protect: (value: string) => string): string {
  if (posts.length === 0) return "No previous posts on this private page.";
  return posts
    .slice()
    .reverse()
    .map((post) => `- ${post.createdAt}: ${post.title ? `${protect(post.title)} — ` : ""}${protect(post.content)}`)
    .join("\n");
}

export function buildPrivatePostMessages(input: {
  account: Pick<NoodleAccount, "displayName" | "handle" | "bio">;
  stagePersonality: string;
  disclosureMode: NoodleIdentityDisclosure;
  publicIdentity: PublicIdentity | null;
  recentPosts: NoodlerManagedPost[];
  request: Pick<NoodlePrivateGenerationRequest, "privatePostGuide" | "privateProjectWork">;
  allowImagePrompt: boolean;
  generationGuidance: string;
}): ChatMessage[] {
  const protect = (value: string) =>
    protectPrivateGeneratedIdentity(value, input.disclosureMode, input.publicIdentity) ?? "";
  const guidance = input.generationGuidance.trim();
  const system = [
    "You write exactly one post for one private NoodleR creator page in Marinara Engine.",
    "Write only as the supplied private account. Do not create other accounts, interactions, follows, or public timeline activity.",
    "Use the private stage profile as supplied.",
    ...(guidance ? [guidance] : []),
    identityInstruction(input.disclosureMode, input.publicIdentity),
    "Write a concise title and a body for the post.",
    input.allowImagePrompt
      ? "Return one JSON object with title, content, and an optional imagePrompt (a short description of a single image to accompany the post, or null). Do not create a poll."
      : "Return one JSON object with title and content only. Do not create a poll or image prompt.",
    "Return JSON only. No prose outside the JSON object.",
  ].join("\n");
  const user = [
    "# Private account",
    `Display name: ${protect(input.account.displayName)}`,
    `Handle: @${protect(input.account.handle)}`,
    `Bio: ${protect(input.account.bio) || "No bio provided."}`,
    `Stage voice: ${protect(input.stagePersonality) || "No additional stage voice provided."}`,
    "",
    "# Recent private posts",
    formatPrivatePostHistory(input.recentPosts, protect),
    ...(input.request.privatePostGuide ? ["", "# Post direction", protect(input.request.privatePostGuide)] : []),
    ...(input.request.privateProjectWork
      ? ["", "# Project work direction", protect(input.request.privateProjectWork)]
      : []),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parsePrivatePost(content: string) {
  return noodleGeneratedPrivatePostSchema.parse(parseGameJsonish(content));
}

export async function generatePrivatePost(
  db: DB,
  input: PrivatePostGenerationInput,
): Promise<GeneratedPrivatePostResult> {
  const noodle = createNoodleStorage(db);
  const { account } = input;
  const settings = await noodle.getSettings();
  const autoPosting = account.settings.scheduler.autoPosting;
  const imagesEnabled = autoPosting?.imagesEnabled === true && !input.media;

  const connections = createConnectionsStorage(db);
  const fallbackConnection = await connections.getFallbackForMain();
  const provider = withConnectionFallbackProvider({
    primary: createLLMProvider(
      input.connection.provider,
      resolveBaseUrl(input.connection),
      input.connection.apiKey,
      input.connection.maxContext,
      input.connection.openrouterProvider,
      input.connection.maxTokensOverride,
      input.connection.claudeFastMode === "true",
      input.connection.treatAsLocalEndpoint === "true",
      input.connection.defaultParameters,
    ),
    primaryConnectionId: input.connection.id,
    fallbackConnection,
    fallbackBaseUrl: fallbackConnection ? resolveBaseUrl(fallbackConnection) : "",
    category: "main",
  });
  const recentPosts = await noodle.listPrivatePostsByAccount(account.id, 8);
  const disclosureMode = account.settings.privacy.identityDisclosure ?? "secret";
  const linkedPublicAccount = account.publicAccountId ? await noodle.getAccountById(account.publicAccountId) : null;
  const publicIdentity = linkedPublicAccount
    ? { displayName: linkedPublicAccount.displayName, handle: linkedPublicAccount.handle }
    : null;
  const messages = buildPrivatePostMessages({
    account,
    stagePersonality: account.settings.privacy.stagePersonality ?? "",
    disclosureMode,
    publicIdentity,
    recentPosts,
    request: input.request,
    allowImagePrompt: imagesEnabled,
    generationGuidance: settings.privateGenerationGuidance,
  });
  const debugMode = input.request.debugMode === true || isDebugAgentsEnabled();
  logDebugOverride(debugMode, "[debug/noodler] Prompt sent to model:\n%s", formatNoodleMessagesForLog(messages));
  const completionOptions = {
    model: input.connection.model,
    maxTokens: clampGenerationMaxOutputTokens({
      provider: input.connection.provider as APIProvider,
      model: input.connection.model,
      maxTokens: resolveStoredMaxTokens(input.connection.defaultParameters, PRIVATE_POST_MAX_TOKENS),
      maxTokensOverride: input.connection.maxTokensOverride,
    }),
    temperature: 0.9,
    topP: 0.95,
    ...resolveStoredChatOptions(
      input.connection.defaultParameters,
      input.connection.provider,
      input.connection.model,
    ),
    stream: false,
    debugMode,
    responseFormat: noodleResponseFormat(input.connection.model, "private_post"),
  } as const;

  let response = await provider.chatComplete(messages, completionOptions);
  let content = response.content ?? "";
  logDebugOverride(debugMode, "[debug/noodler] Raw model response (attempt 1):\n%s", content);
  let generated;
  try {
    generated = parsePrivatePost(content);
  } catch (error) {
    const correctionMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content },
      {
        role: "user",
        content:
          "The response was not one valid private-post JSON object. Return exactly one object with title and content only. Do not include a poll or image prompt. Return JSON only.",
      },
    ];
    logDebugOverride(
      debugMode,
      "[debug/noodler] Correction prompt sent to model:\n%s",
      formatNoodleMessagesForLog(correctionMessages),
    );
    response = await provider.chatComplete(correctionMessages, completionOptions);
    content = response.content ?? "";
    logDebugOverride(debugMode, "[debug/noodler] Raw model response (attempt 2):\n%s", content);
    generated = parsePrivatePost(content);
  }

  const protectedGenerated = {
    title: protectBoundedPrivateGeneratedText(
      generated.title,
      disclosureMode,
      publicIdentity,
      NOODLE_PRIVATE_POST_TITLE_MAX_LENGTH,
    ),
    content: protectBoundedPrivateGeneratedText(
      generated.content,
      disclosureMode,
      publicIdentity,
      NOODLE_PRIVATE_POST_CONTENT_MAX_LENGTH,
    ),
  };
  if (!protectedGenerated.content) throw new Error("Private generation returned no usable post content.");

  // Identity protection applies to the image prompt too, not only post text.
  const draftImagePrompt = imagesEnabled
    ? protectPrivateGeneratedIdentity(generated.imagePrompt, disclosureMode, publicIdentity)
    : null;

  const baseInput = {
    authorAccountId: account.id,
    title: protectedGenerated.title,
    content: protectedGenerated.content,
    source: "generated" as const,
    access: input.request.access,
    ppvPrice: input.request.access === "ppv" ? (input.request.ppvPrice ?? null) : null,
    metadata: {
      ...(input.request.poll ? { poll: createNoodlePoll(input.request.poll) } : {}),
      ...(input.request.imageCrop ? { imageCrop: input.request.imageCrop } : {}),
    },
  };

  const persist = async (
    extra: { id?: string; imagePrompt?: string | null; imageUrl?: string | null; metadata?: Record<string, unknown> } = {},
  ): Promise<NoodlerManagedPost> => {
    const post = await noodle.createPrivatePost({
      ...baseInput,
      ...extra,
      metadata: { ...baseInput.metadata, ...extra.metadata },
    });
    if (!post) throw new Error("Failed to persist the generated private NoodleR post.");
    return post;
  };

  if (input.media) {
    const postId = newId();
    const post = await persistPrivatePostWithUploadedMedia(account.id, postId, input.media, (persistedMedia) =>
      persist({
        id: postId,
        imageUrl: persistedMedia.imageUrl,
        metadata: { privateMediaPath: persistedMedia.privateMediaPath },
      }),
    );
    if (!post) throw new Error("Failed to persist the generated private NoodleR post.");
    return { post, imagePromptReview: null };
  }

  if (!draftImagePrompt) return { post: await persist(), imagePromptReview: null };

  const imageConnection = settings.imageGenerationConnectionId
    ? await connections.getWithKey(settings.imageGenerationConnectionId)
    : await connections.getDefaultForImageGeneration();
  if (!imageConnection) {
    const post = await persist({
      metadata: {
        imageGenerationFailed: true,
        imageGenerationError: "No image generation connection is configured.",
      },
    });
    return { post, imagePromptReview: null };
  }

  const imageInput = {
    account,
    linkedPublicAccount,
    disclosureMode,
    postContent: protectedGenerated.content,
    draftPrompt: draftImagePrompt,
    settings,
    characters: createCharactersStorage(db),
    promptOverrides: createPromptOverridesStorage(db),
    imageConnection,
    db,
    debugMode,
  };

  // Manual Guide review path: persist a pending prompt and hand back a preview for the
  // reviewed-image confirmation route to claim and finalize later.
  if (input.request.reviewImagePromptsBeforeSend === true) {
    try {
      const preview = await generatePrivatePostImage({ ...imageInput, previewOnly: true });
      const post = await persist({ imagePrompt: draftImagePrompt, metadata: { imagePendingReview: true } });
      return {
        post,
        imagePromptReview: preview.preview ? { id: post.id, ...preview.preview } : null,
      };
    } catch (err) {
      logger.warn(err, "[noodler] Failed to prepare image prompt review for %s", account.displayName);
      return {
        post: await persist({
          metadata: { imageGenerationFailed: true, imageGenerationError: getErrorMessage(err).slice(0, 500) },
        }),
        imagePromptReview: null,
      };
    }
  }

  // Immediate generation: only a provider failure falls back to a text-only post. Persistence
  // failures propagate so a single run can never both persist an image post and a text fallback.
  let image: Awaited<ReturnType<typeof generatePrivatePostImage>>;
  try {
    image = await generatePrivatePostImage({ ...imageInput, previewOnly: false });
  } catch (err) {
    logger.warn(err, "[noodler] Failed to generate private image for %s", account.displayName);
    return {
      post: await persist({
        metadata: { imageGenerationFailed: true, imageGenerationError: getErrorMessage(err).slice(0, 500) },
      }),
      imagePromptReview: null,
    };
  }

  // One operation owns promotion and exactly one committed post: the serving URL is derived from
  // a pre-generated id so the image URL and media metadata persist together in a single insert.
  const postId = newId();
  try {
    image.stagedMedia?.promote();
    const post = await persist({
      id: postId,
      imagePrompt: draftImagePrompt,
      imageUrl: privatePostMediaUrl(postId),
      metadata: image.metadata,
    });
    return { post, imagePromptReview: null };
  } catch (err) {
    image.stagedMedia?.compensate();
    throw err;
  }
}
