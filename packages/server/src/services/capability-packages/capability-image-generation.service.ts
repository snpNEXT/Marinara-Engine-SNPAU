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

const MAX_PROMPT_LENGTH = 4_000;
const MAX_IMAGE_DIMENSION = 2_048;

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
  return {
    async getPromptHint(connectionId?: string | null): Promise<string | null> {
      if (!allowed) throw new Error("This capability package has not declared the image-generation permission.");
      const connection = connectionId?.trim()
        ? await connections.getWithKey(connectionId.trim())
        : await connections.getDefaultForImageGeneration();
      const hint = connection && typeof connection.imagePromptHint === "string" ? connection.imagePromptHint.trim() : "";
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
      const fallback = await resolveImageConnectionFallback(connections, connection.id);
      const result = await runImageGenerationRequest({
        connectionKey: connection.id,
        queue: true,
        task: () => generateImage(source, baseUrl, connection.apiKey || "", connection.imageService || source, {
          prompt,
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