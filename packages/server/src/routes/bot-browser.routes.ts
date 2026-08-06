// ──────────────────────────────────────────────
// Routes: Browser (proxy to character sources)
// ──────────────────────────────────────────────
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { createAppSettingsStorage } from "../services/storage/app-settings.storage.js";
import {
  fetchBotBrowserJson,
  type BotBrowserJsonFetchOptions,
} from "../services/bot-browser/fetch-json.js";
import { resolveValidatedImage, safeFetch } from "../utils/security.js";

const CHUB_API_BASE = "https://api.chub.ai";
const CHUB_AVATARS = "https://avatars.charhub.io";
const AVATAR_PROXY_MAX_BYTES = 10 * 1024 * 1024;

async function fetchAvatarImage(url: string, signal: AbortSignal) {
  const res = await safeFetch(url, {
    signal,
    policy: { allowedProtocols: ["https:"] },
    maxResponseBytes: AVATAR_PROXY_MAX_BYTES,
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const image = resolveValidatedImage(buf);
  if (!image) throw new Error("Unsupported avatar image content");
  return { buf, mimeType: image.mimeType };
}

export interface BotBrowserRoutesOptions extends FastifyPluginOptions {
  fetchJson?: (url: string | URL, options: BotBrowserJsonFetchOptions) => Promise<unknown>;
}

export async function botBrowserRoutes(app: FastifyInstance, options: BotBrowserRoutesOptions = {}) {
  const settingsStorage = createAppSettingsStorage(app.db);
  const fetchJson = options.fetchJson ?? fetchBotBrowserJson;
  // -- Search characters on Chub --
  app.get<{
    Querystring: {
      q?: string;
      page?: string;
      sort?: string;
      nsfw?: string;
      tags?: string;
      excludeTags?: string;
      asc?: string;
      min_tokens?: string;
      max_tokens?: string;
      require_images?: string;
      require_lore?: string;
      require_expressions?: string;
      require_alternate_greetings?: string;
      max_days_ago?: string;
      special_mode?: string;
      username?: string;
    };
  }>("/chub/search", async (req) => {
    const {
      q = "",
      page = "1",
      sort = "download_count",
      tags,
      excludeTags,
      asc,
      min_tokens = "50",
      max_tokens,
      require_images,
      require_lore,
      require_expressions,
      require_alternate_greetings,
      max_days_ago,
      special_mode,
      username,
    } = req.query;

    // Build params exactly as Chub API expects them
    const params = new URLSearchParams({
      search: q,
      first: "48",
      page,
      namespace: "characters",
      nsfw: req.query.nsfw ?? "true",
      nsfl: req.query.nsfw ?? "true",
      nsfw_only: "false",
      chub: "true",
      count: "true",
      include_forks: "true",
      venus: "true",
      min_tokens,
    });

    // Sort: only set if not "default" (default = let Chub decide relevance)
    if (sort && sort !== "default") params.set("sort", sort);
    if (asc === "true") params.set("asc", "true");
    if (max_days_ago && max_days_ago !== "0") params.set("max_days_ago", max_days_ago);
    if (special_mode) params.set("special_mode", special_mode);
    if (username) params.set("username", username);
    if (max_tokens) params.set("max_tokens", max_tokens);
    if (tags) params.set("topics", tags);
    if (excludeTags) params.set("excludetopics", excludeTags);
    if (require_images === "true") params.set("require_images", "true");
    if (require_lore === "true") params.set("require_lore", "true");
    if (require_expressions === "true") params.set("require_expressions", "true");
    if (require_alternate_greetings === "true") params.set("require_alternate_greetings", "true");

    // Load API key if configured
    const apiKey = await settingsStorage.get("chub_api_key");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey?.trim()) headers["ch-api-key"] = apiKey;

    return fetchJson(`${CHUB_API_BASE}/search?${params}`, {
      allowedHosts: ["api.chub.ai"],
      method: "GET",
      headers,
    });
  });

  // -- Get full character data from Chub --
  app.get<{ Params: { "*": string } }>("/chub/character/*", async (req) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing character path");
    const nocache = Date.now();
    return fetchJson(
      `${CHUB_API_BASE}/api/characters/${encodeURI(fullPath)}?full=true&nocache=${nocache}`,
      {
        allowedHosts: ["api.chub.ai"],
        maxResponseBytes: 8 * 1024 * 1024,
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      },
    );
  });

  // ── Download character card PNG from Chub (for import) ──
  app.get<{ Params: { "*": string } }>("/chub/download/*", async (req, reply) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing character path");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/chara_card_v2.png`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);

      const buf = Buffer.from(await res.arrayBuffer());
      return reply
        .header("Content-Type", "image/png")
        .header("Content-Disposition", `attachment; filename="character.png"`)
        .send(buf);
    } finally {
      clearTimeout(timeout);
    }
  });

  // ── Proxy character avatar images (avoids CORS for thumbnails) ──
  app.get<{ Params: { "*": string } }>("/chub/avatar/*", async (req, reply) => {
    const fullPath = (req.params as Record<string, string>)["*"];
    if (!fullPath) throw new Error("Missing avatar path");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const primary = await fetchAvatarImage(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/avatar.webp`, controller.signal);
      const image =
        primary ??
        (await fetchAvatarImage(`${CHUB_AVATARS}/avatars/${encodeURI(fullPath)}/chara_card_v2.png`, controller.signal));
      if (!image) return reply.status(404).send({ error: "Avatar not found" });
      return reply.header("Content-Type", image.mimeType).header("Cache-Control", "public, max-age=86400").send(image.buf);
    } catch (err) {
      if ((err as Error).message.includes("Unsupported avatar image content")) {
        return reply.status(415).send({ error: "Unsupported avatar content type" });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  });
}
