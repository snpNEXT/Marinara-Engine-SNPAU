import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileNativeDB } from "../../packages/server/src/db/file-backed-store.js";
import { memoryChunks } from "../../packages/server/src/db/schema/index.js";
import { resolveRoleplayChatSummary } from "../../packages/server/src/routes/generate/generate-route-utils.js";
import { injectMemoryRecallContext } from "../../packages/server/src/services/generation/memory-recall-context.js";
import { recallMemories, type MemoryRecallEmbeddingSource } from "../../packages/server/src/services/memory-recall.js";

const summaryMetadata = {
  summary: "Settled history.\n\nDiscarded assistant response.",
  summaryEntries: [
    {
      id: "settled-summary",
      origin: "automated",
      content: "Settled history.",
      enabled: true,
      messageIds: ["older-user", "older-assistant"],
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:00:00.000Z",
    },
    {
      id: "contaminated-summary",
      origin: "automated",
      content: "Discarded assistant response.",
      enabled: true,
      messageIds: ["latest-user", "regenerated-assistant"],
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
    },
  ],
};

assert.equal(
  resolveRoleplayChatSummary("roleplay", summaryMetadata),
  summaryMetadata.summary,
  "ordinary roleplay generations must retain the complete compiled summary",
);
assert.equal(
  resolveRoleplayChatSummary("roleplay", summaryMetadata, {
    excludeMessageIds: ["regenerated-assistant"],
  }),
  "Settled history.",
  "regeneration must drop every summary entry covering the response being replaced",
);
assert.equal(
  resolveRoleplayChatSummary("visual_novel", summaryMetadata, {
    excludeMessageIds: ["older-user", "regenerated-assistant"],
  }),
  null,
  "regeneration must omit the summary block when every entry covers an excluded message",
);
assert.equal(
  resolveRoleplayChatSummary("roleplay", summaryMetadata, {
    excludeMessageIds: ["message-not-covered-by-summary"],
  }),
  summaryMetadata.summary,
  "unrelated regeneration targets must leave the precompiled summary unchanged",
);
assert.equal(
  resolveRoleplayChatSummary(
    "roleplay",
    {
      summary: "Legacy summary without per-message provenance.",
    },
    {
      excludeMessageIds: ["regenerated-assistant"],
    },
  ),
  null,
  "regeneration must omit a legacy summary that cannot prove it excludes the discarded response",
);

const storageDir = mkdtempSync(join(tmpdir(), "marinara-regeneration-context-"));
process.env.FILE_STORAGE_DIR = storageDir;
const db = await createFileNativeDB();
const embeddingSource: MemoryRecallEmbeddingSource = {
  label: "regeneration regression",
  embed: async (texts) => texts.map(() => [1, 0]),
};

try {
  await db.insert(memoryChunks).values([
    {
      id: "settled-memory",
      chatId: "regen-chat",
      content: "Settled memory.",
      embedding: JSON.stringify([1, 0]),
      messageCount: 5,
      sourceChatId: null,
      firstMessageAt: "2026-07-29T08:00:00.000Z",
      lastMessageAt: "2026-07-29T09:00:00.000Z",
      createdAt: "2026-07-29T09:00:00.000Z",
    },
    {
      id: "contaminated-memory",
      chatId: "regen-chat",
      content: "Latest user prompt and discarded assistant response.",
      embedding: JSON.stringify([1, 0]),
      messageCount: 5,
      sourceChatId: null,
      firstMessageAt: "2026-07-29T09:30:00.000Z",
      lastMessageAt: "2026-07-29T10:00:00.000Z",
      createdAt: "2026-07-29T10:00:00.000Z",
    },
    {
      id: "newer-memory",
      chatId: "regen-chat",
      content: "Anything newer than the regenerated response.",
      embedding: JSON.stringify([1, 0]),
      messageCount: 5,
      sourceChatId: null,
      firstMessageAt: "2026-07-29T10:01:00.000Z",
      lastMessageAt: "2026-07-29T11:00:00.000Z",
      createdAt: "2026-07-29T11:00:00.000Z",
    },
  ]);

  const ordinaryRecall = await recallMemories(db, "Latest user prompt", ["regen-chat"], {
    embeddingSource,
  });
  assert.equal(ordinaryRecall.length, 3, "ordinary recall must continue considering every relevant memory chunk");

  const regenerationRecall = await recallMemories(db, "Latest user prompt", ["regen-chat"], {
    embeddingSource,
    excludeFromMessageAt: "2026-07-29T10:00:00.000Z",
  });
  assert.deepEqual(
    regenerationRecall.map((memory) => memory.content),
    ["Settled memory."],
    "regeneration recall must exclude chunks ending on or after the response being replaced",
  );

  const promptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  const recalledLines = await injectMemoryRecallContext({
    db,
    messages: promptMessages,
    currentInputMessages: [{ role: "user", content: "Latest user prompt" }],
    chatId: "regen-chat",
    embeddingSource,
    excludeFromMessageAt: "2026-07-29T10:00:00.000Z",
    contextLimit: undefined,
    sendProgress: () => {},
    wrapFormat: "none",
  });
  assert.deepEqual(recalledLines, ["Settled memory."]);
  assert.doesNotMatch(
    promptMessages[0]?.content ?? "",
    /discarded assistant response/u,
    "the injected Memories block must not contain the regenerated response",
  );
} finally {
  await db._fileStore.close();
  rmSync(storageDir, { recursive: true, force: true });
}

console.info("Regeneration summary and memory-context regression passed.");
