import {
  type APIProvider,
  type NoodleAccount,
  type NoodleBootstrap,
  type NoodleSettings,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { logDebugOverride } from "../../lib/logger.js";
import { resolveBaseUrl } from "../generation/connection-base-url.js";
import { resolveStoredChatOptions } from "../generation/generation-parameters.js";
import { clampGenerationMaxOutputTokens } from "../generation/output-token-limits.js";
import type { ConnectionAdmissionMode } from "../generation/connection-admission.js";
import type { ImageCaptioningRuntime } from "../generation/image-captioning-runtime.js";
import type { ChatMessage } from "../llm/base-provider.js";
import { withConnectionFallbackProvider } from "../llm/connection-fallback-provider.js";
import { createLLMProvider } from "../llm/provider-registry.js";
import { createCharacterGalleryStorage } from "../storage/character-gallery.storage.js";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { createChatsStorage } from "../storage/chats.storage.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createNoodleStorage } from "../storage/noodle.storage.js";
import { createPromptOverridesStorage } from "../storage/prompt-overrides.storage.js";
import { parseNoodleGeneratedRefreshResponse } from "./noodle-generated-refresh.js";
import { normalizeNoodleImagePrompt } from "./noodle-image-prompt.js";
import { generateNoodlePostImage } from "./noodle-public-images.service.js";
import { buildRefreshPrompt } from "./noodle-public-prompt.service.js";
import {
  bootstrapVisibleNoodle,
  mentionedAccountMetadata,
  mentionedCharacterAccounts,
  noodleDigestAccountLabel,
  resolvePersonaAccount,
} from "./noodle-public-support.js";
import { noodleResponseFormat } from "./noodle-response-format.js";

type GenerationConnection = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createConnectionsStorage>["getWithKey"]>>
>;

function normalizedHandle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function buildNudgeMessages(input: {
  context: Awaited<ReturnType<typeof buildRefreshPrompt>>;
  account: NoodleAccount;
  targetPost: Awaited<ReturnType<ReturnType<typeof createNoodleStorage>["getPostById"]>>;
  targetAuthor: NoodleAccount | null;
  guidance: string;
  includeImagePrompt: boolean;
}): ChatMessage[] {
  const isReply = Boolean(input.targetPost);
  const system = [
    isReply
      ? `Write exactly one in-character public Noodle reply for ${input.account.displayName} (@${input.account.handle}).`
      : `Write exactly one in-character public Noodle post for ${input.account.displayName} (@${input.account.handle}).`,
    "Use the supplied character profile and timeline context, but do not speak for any other account.",
    "All generated content must be suitable for an adult social platform and remain faithful to the character.",
    input.guidance ? `User guidance: ${input.guidance}` : "",
    input.includeImagePrompt
      ? "For a post, include an imagePrompt only when an image would feel natural; describe the visible character or meme clearly."
      : "",
    "Return JSON only. No prose outside the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");
  const contextMessages = input.context.textOnlyMessages.slice(1);
  const task = isReply
    ? [
        "# Post to reply to",
        `${input.targetAuthor?.displayName ?? "Someone"}: ${input.targetPost?.content.slice(0, 1000) ?? ""}`,
        "# Task",
        `Write exactly one reply to post ${input.targetPost?.id} as ${input.account.displayName} (@${input.account.handle}).`,
        JSON.stringify(
          {
            interactions: [
              {
                actorHandle: input.account.handle,
                targetPostId: input.targetPost?.id,
                type: "reply",
                content: "reply text",
              },
            ],
          },
          null,
          2,
        ),
      ]
    : [
        "# Task",
        `Write exactly one new post as ${input.account.displayName} (@${input.account.handle}).`,
        JSON.stringify(
          {
            posts: [
              {
                authorHandle: input.account.handle,
                content: "post text",
                ...(input.includeImagePrompt ? { imagePrompt: null } : {}),
              },
            ],
          },
          null,
          2,
        ),
      ];
  return [{ role: "system", content: system }, ...contextMessages, { role: "user", content: task.join("\n") }];
}

export async function generatePublicNoodleNudge(input: {
  db: DB;
  accountId: string;
  connection: GenerationConnection;
  settings: NoodleSettings;
  personaId?: string;
  targetPostId?: string;
  prompt?: string;
  fastMode?: boolean;
  debugMode: boolean;
  imageCaptioning: ImageCaptioningRuntime;
  admissionMode?: ConnectionAdmissionMode;
}): Promise<NoodleBootstrap> {
  const noodle = createNoodleStorage(input.db);
  const characters = createCharactersStorage(input.db);
  const chats = createChatsStorage(input.db);
  const connections = createConnectionsStorage(input.db);
  const promptOverrides = createPromptOverridesStorage(input.db);
  const characterGallery = createCharacterGalleryStorage(input.db);
  const account = await noodle.getAccountById(input.accountId);
  if (!account) throw new Error("Noodle account not found");
  if (account.kind !== "character") throw new Error("Only character accounts can be nudged.");
  const personaAccount = await resolvePersonaAccount(noodle, characters, input.personaId);
  const targetPost = input.targetPostId ? await noodle.getPostById(input.targetPostId) : null;
  if (input.targetPostId && !targetPost) throw new Error("Target post not found.");
  const targetAuthor = targetPost ? await noodle.getAccountById(targetPost.authorAccountId) : null;
  const context = await buildRefreshPrompt({
    db: input.db,
    noodle,
    characters,
    chats,
    promptOverrides,
    activeAccounts: [account],
    personaAccount,
    settings: input.settings,
    imageCaptioning: input.imageCaptioning,
    debugMode: input.debugMode,
  });
  const fallbackConnection = await connections.getFallbackForMain();
  const provider = withConnectionFallbackProvider({
    primary: createLLMProvider(
      input.connection.provider,
      resolveBaseUrl(input.connection),
      input.connection.apiKey,
      input.connection.maxContext,
      input.connection.openrouterProvider,
      input.connection.maxTokensOverride,
      input.connection.claudeFastMode === "true" || input.fastMode === true,
      input.connection.treatAsLocalEndpoint === "true",
      input.connection.defaultParameters,
    ),
    primaryConnectionId: input.connection.id,
    fallbackConnection,
    fallbackBaseUrl: fallbackConnection ? resolveBaseUrl(fallbackConnection) : "",
    category: "main",
    admissionMode: input.admissionMode,
  });
  const messages = buildNudgeMessages({
    context,
    account,
    targetPost,
    targetAuthor,
    guidance: input.prompt?.trim() ?? "",
    includeImagePrompt: !targetPost && input.settings.enableImagePrompts,
  });
  logDebugOverride(
    input.debugMode,
    "[debug/noodle/nudge] Prompt sent to model:\n%s",
    messages.map((message) => `${message.role}: ${message.content}`).join("\n\n"),
  );
  const response = await provider.chatComplete(messages, {
    model: input.connection.model,
    maxTokens: clampGenerationMaxOutputTokens({
      provider: input.connection.provider as APIProvider,
      model: input.connection.model,
      maxTokens: input.fastMode ? 768 : 1024,
      maxTokensOverride: input.connection.maxTokensOverride,
    }),
    temperature: input.settings.generationTemperature,
    topP: input.settings.generationTopP,
    ...resolveStoredChatOptions(input.connection.defaultParameters, input.connection.provider, input.connection.model),
    stream: false,
    debugMode: input.debugMode,
    responseFormat: noodleResponseFormat(input.connection.model, "timeline"),
  });
  const parsed = parseNoodleGeneratedRefreshResponse(response.content ?? "").refresh;
  if (targetPost) {
    const generated = parsed.interactions.find(
      (interaction) =>
        interaction.type === "reply" &&
        normalizedHandle(interaction.actorHandle) === normalizedHandle(account.handle) &&
        (!interaction.targetPostId || interaction.targetPostId === targetPost.id),
    );
    if (!generated?.content?.trim()) throw new Error("The model did not return a usable reply.");
    const interaction = await noodle.createInteraction(targetPost.id, {
      actorAccountId: account.id,
      type: "reply",
      content: generated.content.trim(),
      parentInteractionId: null,
    });
    if (!interaction) throw new Error("Failed to save the Noodle reply.");
    await noodle.createDigest({
      accountIds: Array.from(new Set([account.id, targetPost.authorAccountId])),
      content: `${noodleDigestAccountLabel(account)} replied to a Noodle post: ${interaction.content}`,
      sourcePostId: targetPost.id,
      sourceInteractionId: interaction.id,
    });
  } else {
    const generated = parsed.posts.find(
      (post) => normalizedHandle(post.authorHandle) === normalizedHandle(account.handle) && post.content.trim(),
    );
    if (!generated) throw new Error("The model did not return a usable post.");
    let imageUrl: string | null = null;
    const mediaMetadata: Record<string, unknown> = {};
    const imagePrompt = normalizeNoodleImagePrompt(generated.imagePrompt);
    if (imagePrompt && input.settings.enableImagePrompts) {
      const imageConnection = input.settings.imageGenerationConnectionId
        ? await connections.getWithKey(input.settings.imageGenerationConnectionId)
        : await connections.getDefaultForImageGeneration();
      if (imageConnection) {
        try {
          const image = await generateNoodlePostImage({
            account,
            referenceAccounts: [account],
            postContent: generated.content,
            draftPrompt: imagePrompt,
            settings: input.settings,
            characters,
            characterGallery,
            promptOverrides,
            imageConnection,
            db: input.db,
            debugMode: input.debugMode,
            admissionMode: input.admissionMode,
          });
          imageUrl = image.imageUrl;
          Object.assign(mediaMetadata, image.metadata);
        } catch {
          mediaMetadata.imageGenerationFailed = true;
        }
      }
    }
    const mentionedAccounts = mentionedCharacterAccounts(await noodle.listAccounts(), generated.content);
    const post = await noodle.createPost({
      authorAccountId: account.id,
      content: generated.content.trim(),
      imagePrompt,
      imageUrl,
      source: "generated",
      metadata: {
        nudged: true,
        nudgePrompt: input.prompt?.trim() || null,
        ...mediaMetadata,
        ...mentionedAccountMetadata(mentionedAccounts),
      },
    });
    if (!post) throw new Error("Failed to save the Noodle post.");
    const digest = await noodle.createDigest({
      accountIds: [account.id, ...mentionedAccounts.map((mentionedAccount) => mentionedAccount.id)],
      content: `${noodleDigestAccountLabel(account)} posted on Noodle: ${post.content}`,
      sourcePostId: post.id,
    });
    await noodle.updatePostMedia(post.id, { metadata: { activityDigestId: digest.id } });
  }
  return bootstrapVisibleNoodle(noodle, characters);
}
