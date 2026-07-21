// ──────────────────────────────────────────────
// Registered prompt-override keys: Noodle social feed
// ──────────────────────────────────────────────
import type { PromptOverrideKeyDef } from "../types.js";
import { NOODLE_TIMELINE_BASE_DEFAULT_PROMPT, noodleTimelineVoiceDefaultText } from "../../noodle/noodle-prompt.js";

export interface NoodleImagePostCtx extends Record<string, string | number | undefined> {
  authorName: string;
  postContent: string;
  draftPrompt: string;
  userInstructions: string;
  characterDescription: string;
  connectionHint: string;
}

export const NOODLE_IMAGE_POST: PromptOverrideKeyDef<NoodleImagePostCtx> = {
  key: "noodle.imagePost",
  label: "Noodle Post Image",
  description:
    "Template that assembles the final image-generation prompt. The default sends the visual idea, appearance notes, and Noodle image directions without the post text or meta-instructions.",
  variables: [
    { name: "authorName", description: "Display name of the Noodle account posting.", example: "Dottore" },
    {
      name: "postContent",
      description: "The Noodle post text, available for custom templates but omitted by the default image prompt.",
      example: "I left one meeting unattended for six minutes and returned to theatrical accusations.",
    },
    {
      name: "draftPrompt",
      description: "The timeline writer's initial image idea for this post.",
      example: 'Meme image: Dottore staring at a ruined lab bench, caption text "six minutes unsupervised" at the top',
    },
    {
      name: "userInstructions",
      description: "Noodle-specific image instructions from Noodle Settings.",
      example:
        "Create either a social-media-ready character image or a meme. Mention build, clothing, appearance, pose, expression, setting, lighting, mood, composition, meme format, and short visible meme text when relevant.",
    },
    {
      name: "characterDescription",
      description: "Optional character appearance or description notes included by Noodle Settings.",
      example: "Character appearance notes:\nDottore's Appearance: tall, slim build, blue hair, red eyes, mask.",
    },
    {
      name: "connectionHint",
      description: "Optional image-prompt formatting hint from the image generation connection (e.g. tag style, quality tokens, negative conventions).",
      example: "Use danbooru-style comma-separated tags. Always start with: masterpiece, best quality.",
    },
  ],
  defaultBuilder: (ctx) =>
    [
      `Create one concise image-generation prompt for a fake social media post by ${ctx.authorName}.`,
      ``,
      `Post text: ${ctx.postContent}`,
      `Draft image idea: ${ctx.draftPrompt.trim() || `A social-media-ready image posted by ${ctx.authorName}.`}`,
      ctx.userInstructions?.trim() ? `User instructions: ${ctx.userInstructions.trim()}` : "",
      ctx.characterDescription?.trim() ?? "",
      ``,
      `The image may be either a character-focused image or an in-character meme. Choose one clear visible-character viewpoint: selfie or mirror selfie (the character is visible holding the phone or in the reflection), a photo taken by a friend (the character is visible), or a back-facing or over-the-shoulder photo (the character is visible from behind). Do not use first-person POV, an empty scene, or an unseen camera operator's viewpoint unless the post explicitly asks for it. Default to casual phone selfies, mirror selfies, back-facing or over-the-shoulder photos, handheld candid shots, or photos taken by a friend. Use a tripod, studio, professional photographer, posed photoshoot, or polished commercial photography only when the character's occupation, wealth, setting, or post context makes that plausible. Vary framing and do not always show the character's face.`,
      `For character-focused images, describe the visible subject, build/body type when relevant, clothing, appearance, expression, pose, setting, lighting, mood, framing, and composition.`,
      `For memes, describe the meme format, visual gag, composition, character appearance if a character is visible, and exact short readable caption/text only when the meme needs it.`,
      `Do not include UI chrome, social-media interface elements, watermarks, or unrelated text.`,
      `Output only the final positive image prompt.`,
      ctx.connectionHint?.trim() ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  exampleContext: {
    authorName: "Dottore",
    postContent: "I left one meeting unattended for six minutes and returned to theatrical accusations.",
    draftPrompt:
      'Meme image: Dottore staring at a ruined lab bench, caption text "six minutes unsupervised" at the top',
    userInstructions:
      "Create either a social-media-ready character image or a meme. Mention build, clothing, appearance, pose, expression, setting, lighting, mood, composition, meme format, and short visible meme text when relevant.",
    characterDescription:
      "Character appearance notes:\nDottore's Appearance: tall, slim build, blue hair, red eyes, mask.",
    connectionHint: "",
  },
};

export type NoodleTimelineBaseCtx = Record<string, string | number | undefined>;

export const NOODLE_TIMELINE_BASE: PromptOverrideKeyDef<NoodleTimelineBaseCtx> = {
  key: "noodle.timelineBase",
  label: "Noodle Timeline Prompt",
  description:
    "The editable base system prompt used for Noodle timeline refreshes. Timeline voice and tone instructions are appended after this prompt.",
  variables: [],
  defaultBuilder: () => NOODLE_TIMELINE_BASE_DEFAULT_PROMPT,
  exampleContext: {},
};

export interface NoodleTimelineVoiceCtx extends Record<string, string | number | undefined> {
  /** Mirrors the Noodle setting `enableEnhancedTimelineWriting` ("true"/"false"). Only affects the
   *  unedited default text — once a user customizes this override, their text always wins. */
  enhanced: string;
  allowRandomUsers?: string;
}

export const NOODLE_TIMELINE_VOICE: PromptOverrideKeyDef<NoodleTimelineVoiceCtx> = {
  key: "noodle.timelineVoice",
  label: "Noodle Timeline Voice & Tone",
  description:
    "Tone and creative-freedom instructions for Noodle timeline refreshes: how much personality/attitude each account's voice should carry, and how much accounts may banter, joke, or clash with each other. This text is appended after the editable Noodle Timeline Prompt.",
  variables: [],
  defaultBuilder: (ctx) => noodleTimelineVoiceDefaultText(ctx.enhanced === "true", ctx.allowRandomUsers !== "false"),
  exampleContext: { enhanced: "false", allowRandomUsers: "true" },
};
