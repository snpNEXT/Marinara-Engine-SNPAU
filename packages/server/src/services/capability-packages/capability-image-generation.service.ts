import { inferImageSource } from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import type {
  CapabilityGeneratedImage,
  CapabilityImageGenerationHost,
  CapabilityImageGenerationRequest,
} from "@marinara-engine/shared";
import { resolveBaseUrl } from "../generation/connection-base-url.js";
import { resolveImageConnectionFallback } from "../generation/media-connection-fallback.js";
import { generateImage } from "../image/image-generation.js";
import { resolveConnectionImageDefaults } from "../image/image-generation-defaults.js";
import { runImageGenerationRequest } from "../image/image-generation-queue.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createCapabilityLanguageModelHost } from "./capability-language-model.service.js";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_IMAGE_DIMENSION = 2_048;
const IMAGE_PROMPT_REWRITE_SYSTEM_MESSAGE =
  "Rewrite image ideas into a concise provider-ready prompt. Follow the image backend rules exactly. " +
  "Prefer comma-separated tags and only minimal natural language when the rules call for tags. " +
  "Preserve the supplied subject, identity, appearance, action, composition, and style details. Do not " +
  "silently discard concrete details merely because the input contains multiple kinds of context. Do not add " +
  "commentary, markdown, labels, or explanations. Return only the final positive image prompt.";

function boundedDimension(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(MAX_IMAGE_DIMENSION, Math.max(64, Math.round(value!)));
}

export function createCapabilityImageGenerationHost(
  db: DB,
  _packageId: string,
  allowed: boolean,
): CapabilityImageGenerationHost {
  const connections = createConnectionsStorage(db);
  const languageModels = createCapabilityLanguageModelHost(db);
  const rewritePromptForImageConnection = async (prompt: string, hint: string): Promise<string> => {
    try {
      const model = await languageModels.resolve();
      const result = await model.chatComplete([
        { role: "system", content: IMAGE_PROMPT_REWRITE_SYSTEM_MESSAGE },
        {
          role: "user",
          content: `<image_backend_rules>\n${hint}\n</image_backend_rules>\n<image_idea>\n${prompt}\n</image_idea>`,
        },
      ]);
      const rewritten = result.content?.trim() || "";
      return rewritten || prompt;
    } catch {
      return prompt;
    }
  };
  return {
    async getPromptHint(connectionId?: string | null): Promise<string | null> {
      if (!allowed) throw new Error("This capability package has not declared the image-generation permission.");
      const connection = connectionId?.trim()
        ? await connections.getWithKey(connectionId.trim())
        : await connections.getDefaultForImageGeneration();
      const hint =
        connection && typeof connection.imagePromptInstructions === "string"
          ? connection.imagePromptInstructions.trim()
          : "";
      return hint || null;
    },
    async generate(request: CapabilityImageGenerationRequest): Promise<CapabilityGeneratedImage> {
      if (!allowed) throw new Error("This capability package has not declared the image-generation permission.");
      const prompt = request.prompt.trim();
      if (!prompt) throw new Error("Image generation requires a prompt.");
      if (prompt.length > MAX_PROMPT_LENGTH) throw new Error("Image generation prompt exceeds 4,000 characters.");
      const connection = request.connectionId?.trim()
        ? await connections.getWithKey(request.connectionId.trim())
        : await connections.getDefaultForImageGeneration();
      if (!connection) throw new Error("Choose an image generation connection before generating an image.");
      if (connection.provider !== "image_generation") {
        throw new Error("The selected connection is not configured for image generation.");
      }
      const baseUrl = resolveBaseUrl(connection);
      if (!baseUrl) throw new Error("The selected image connection has no base URL.");
      const model = connection.model?.trim() || "";
      const source = String(connection.imageGenerationSource || connection.imageService || "").trim() || inferImageSource(model, baseUrl);
      const imagePromptInstructions =
        typeof connection.imagePromptInstructions === "string" ? connection.imagePromptInstructions.trim() : "";
      const providerPrompt = imagePromptInstructions
        ? await rewritePromptForImageConnection(prompt, imagePromptInstructions)
        : prompt;
      const fallback = await resolveImageConnectionFallback(connections, connection.id);
      const result = await runImageGenerationRequest({
        connectionKey: connection.id,
        queue: true,
        task: () => generateImage(source, baseUrl, connection.apiKey || "", connection.imageService || source, {
          prompt: providerPrompt,
          negativePrompt: request.negativePrompt?.trim() || undefined,
          model,
          width: boundedDimension(request.width),
          height: boundedDimension(request.height),
          imageEndpointId: connection.imageEndpointId || undefined,
          comfyWorkflow: connection.comfyuiWorkflow || undefined,
          imageDefaults: resolveConnectionImageDefaults(connection),
          fallback,
        }),
      });
      const value: CapabilityGeneratedImage = {
        dataUrl: `data:${result.mimeType};base64,${result.base64}`,
        mimeType: result.mimeType,
        width: boundedDimension(request.width) ?? null,
        height: boundedDimension(request.height) ?? null,
        connectionId: result.effectiveConnection?.connectionId || connection.id,
        model: result.effectiveConnection?.model || model,
        fromCache: false,
      };
      return value;
    },
  };
}