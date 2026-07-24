import type {
  NoodlePrivateGenerationRequest,
  NoodlePrivatePostCreateInput,
  NoodlerManagedPost,
} from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import { createConnectionsStorage } from "../storage/connections.storage.js";
import { createNoodleStorage } from "../storage/noodle.storage.js";
import { generatePrivatePost } from "./noodle-private-generation.service.js";
import { tryNoodlePrivateAccountOperation } from "./noodle-private-account-operation-lock.js";

export type GenerateNoodlePrivatePostResult =
  | { status: "generated"; post: NoodlerManagedPost }
  | { status: "disabled" }
  | { status: "busy" }
  | { status: "connection_required" }
  | { status: "connection_not_found" }
  | { status: "private_account_not_found" };

export type CreateNoodlePrivatePostResult =
  | { status: "created"; post: NoodlerManagedPost }
  | { status: "disabled" }
  | { status: "busy" }
  | { status: "private_account_not_found" };

/**
 * Reusable generated-post application seam for HTTP now and Slice 8 scheduling later.
 * Provider and persistence failures intentionally throw for the caller to handle.
 */
export async function generateNoodlePrivatePost(
  db: DB,
  request: NoodlePrivateGenerationRequest,
): Promise<GenerateNoodlePrivatePostResult> {
  const noodle = createNoodleStorage(db);
  const settings = await noodle.getSettings();
  if (!settings.enableNoodler) return { status: "disabled" };

  const locked = await tryNoodlePrivateAccountOperation(request.targetAccountId, async () => {
    const account = await noodle.getPrivateAccountById(request.targetAccountId);
    if (!account) {
      return { status: "private_account_not_found" } as const;
    }
    const connectionId = request.connectionId ?? settings.generationConnectionId;
    if (!connectionId) return { status: "connection_required" } as const;
    const connection = await createConnectionsStorage(db).getWithKey(connectionId);
    if (!connection) return { status: "connection_not_found" } as const;
    const post = await generatePrivatePost(db, { account, request, connection });
    return { status: "generated", post } as const;
  });
  return locked.acquired ? locked.value : { status: "busy" };
}

export async function createNoodlePrivatePost(
  db: DB,
  input: NoodlePrivatePostCreateInput,
): Promise<CreateNoodlePrivatePostResult> {
  const noodle = createNoodleStorage(db);
  const settings = await noodle.getSettings();
  if (!settings.enableNoodler) return { status: "disabled" };

  const locked = await tryNoodlePrivateAccountOperation(input.targetAccountId, async () => {
    const post = await noodle.createPrivatePost({
      authorAccountId: input.targetAccountId,
      title: input.title,
      content: input.content,
      imageUrl: null,
      imagePrompt: null,
      source: "manual",
      access: input.access,
      ppvPrice: input.access === "ppv" ? (input.ppvPrice ?? null) : null,
      metadata: {},
    });
    if (!post) return { status: "private_account_not_found" } as const;
    return { status: "created", post } as const;
  });
  return locked.acquired ? locked.value : { status: "busy" };
}
