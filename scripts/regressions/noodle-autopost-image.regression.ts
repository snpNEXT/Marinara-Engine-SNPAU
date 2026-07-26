import assert from "node:assert/strict";
import {
  noodleAccountSchedulerPatchSchema,
  noodleAutoPostingSettingsSchema,
  noodleGeneratedPrivatePostSchema,
} from "../../packages/shared/src/schemas/noodle.schema.js";
import { protectPrivateGeneratedIdentity } from "../../packages/server/src/services/noodle/noodle-private-generation.service.js";
import {
  privatePostMediaUrl,
  readPrivateMediaPath,
  resolvePrivateMediaAbsolutePath,
} from "../../packages/server/src/services/noodle/noodle-private-media.js";

// NoodleR-owned image enablement is the single one-image policy on the autoPosting subtree.
const settings = noodleAutoPostingSettingsSchema.parse({ imagesEnabled: true });
assert.equal(settings.imagesEnabled, true);
assert.equal(noodleAutoPostingSettingsSchema.parse({}).imagesEnabled, false);
// The client patch may carry the image toggle but never the server-owned nextRunAt.
assert.ok(noodleAccountSchedulerPatchSchema.parse({ autoPosting: { imagesEnabled: true } }));
// The removed per-run quota is rejected by the strict schema.
assert.throws(() => noodleAccountSchedulerPatchSchema.parse({ autoPosting: { maxImagesPerRun: 3 } }));

// The private generator surfaces its optional imagePrompt (no second text-model call) but
// never a poll.
const generated = noodleGeneratedPrivatePostSchema.parse({
  title: "Studio day",
  content: "Behind the scenes.",
  imagePrompt: "a cozy studio corner",
  poll: null,
});
assert.equal(generated.imagePrompt, "a cozy studio corner");
assert.ok(!("poll" in generated));
assert.equal(noodleGeneratedPrivatePostSchema.parse({ title: "x", content: "y" }).imagePrompt, null);

// Identity protection applies to the image prompt, not only post text.
const linked = { displayName: "Jane Doe", handle: "janedoe" };
assert.ok(!protectPrivateGeneratedIdentity("portrait of @janedoe smiling", "secret", linked)!.includes("janedoe"));
assert.ok(!protectPrivateGeneratedIdentity("portrait of Jane Doe smiling", "hinted", linked)!.includes("Jane Doe"));
// Open disclosure keeps the identity.
assert.ok(protectPrivateGeneratedIdentity("portrait of @janedoe", "open", linked)!.includes("janedoe"));

// Private media is only reachable through the access-checked endpoint namespace.
assert.equal(privatePostMediaUrl("post123"), "/api/noodle/noodler/posts/post123/media");
assert.equal(readPrivateMediaPath({ metadata: { privateMediaPath: "noodler-private/acc/img.png" } }), "noodler-private/acc/img.png");
assert.equal(readPrivateMediaPath({ metadata: { privateMediaPath: "some/other/img.png" } }), null);
assert.equal(readPrivateMediaPath({ metadata: {} }), null);
// Traversal and non-namespaced paths never resolve to an on-disk file.
assert.equal(resolvePrivateMediaAbsolutePath("noodler-private/../../etc/passwd"), null);
assert.equal(resolvePrivateMediaAbsolutePath("gallery/chat/img.png"), null);
assert.ok(resolvePrivateMediaAbsolutePath("noodler-private/acc/img.png")?.endsWith("noodler-private/acc/img.png"));

process.stdout.write("Noodle autopost image regression passed.\n");
