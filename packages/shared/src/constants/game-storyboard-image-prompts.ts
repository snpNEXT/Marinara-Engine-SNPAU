import type { AgentPromptTemplateOption } from "../types/agent.js";

export const GAME_STORYBOARD_IMAGE_PROMPT_TEMPLATE_ID = "game-scene-illustration";
export const STORYBOARD_OPTIMIZED_IMAGE_PROMPT_TEMPLATE_ID = "storyboard-illustration";
export const STORYBOARD_FIRST_FRAME_IMAGE_PROMPT_TEMPLATE_ID = "storyboard-first-frame";

export const GAME_STORYBOARD_IMAGE_PROMPT_TEMPLATE_VARIABLES = [
  "sceneTitleLine",
  "scenePrompt",
  "finalVisibilityRuleLine",
  "narrativePurposeLine",
  "charactersLine",
  "referenceHandlingLine",
  "locationHandlingLine",
  "appearanceNotesBlock",
  "artDirectionLine",
  "imagePromptInstructionsLine",
] as const;

export const GAME_STORYBOARD_IMAGE_PROMPT_TEMPLATE = [
  "${sceneTitleLine}",
  "Scene moment: ${scenePrompt}",
  "${finalVisibilityRuleLine}",
  "${narrativePurposeLine}",
  "${charactersLine}",
  "${referenceHandlingLine}",
  "${locationHandlingLine}",
  "${appearanceNotesBlock}",
  "${artDirectionLine}",
  "${imagePromptInstructionsLine}",
].join("\n");

export const STORYBOARD_OPTIMIZED_IMAGE_PROMPT_TEMPLATE = [
  "${sceneTitleLine}",
  "Storyboard keyframe: ${scenePrompt}",
  "${finalVisibilityRuleLine}",
  "${referenceHandlingLine}",
  "${locationHandlingLine}",
  "${appearanceNotesBlock}",
  "${artDirectionLine}",
  "${imagePromptInstructionsLine}",
].join("\n");

export const STORYBOARD_FIRST_FRAME_IMAGE_PROMPT_TEMPLATE = [
  "${scenePrompt}",
  "${locationHandlingLine}",
  "${imagePromptInstructionsLine}",
].join(" ");

export const GAME_STORYBOARD_IMAGE_BUILT_IN_PROMPT_TEMPLATES: AgentPromptTemplateOption[] = [
  {
    id: GAME_STORYBOARD_IMAGE_PROMPT_TEMPLATE_ID,
    name: "Game Scene Illustration",
    description:
      "Uses the standard Game Mode scene-illustration formatter. Existing chats keep this behavior by default.",
    promptTemplate: GAME_STORYBOARD_IMAGE_PROMPT_TEMPLATE,
  },
  {
    id: STORYBOARD_OPTIMIZED_IMAGE_PROMPT_TEMPLATE_ID,
    name: "Storyboard Illustration",
    description:
      "Keeps the planner's keyframe description primary while adding character references, appearance, campaign art direction, and image instructions.",
    promptTemplate: STORYBOARD_OPTIMIZED_IMAGE_PROMPT_TEMPLATE,
  },
  {
    id: STORYBOARD_FIRST_FRAME_IMAGE_PROMPT_TEMPLATE_ID,
    name: "Storyboard First Frame",
    description:
      "Sends the planner's complete T=0 scene directly, without adding the keyframe title, prompt labels, or repeated art direction.",
    promptTemplate: STORYBOARD_FIRST_FRAME_IMAGE_PROMPT_TEMPLATE,
  },
];
