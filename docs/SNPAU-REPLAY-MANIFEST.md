# SNPAU Replay Manifest

This branch was rebuilt from `origin/staging` at `f52d6a935` rather than by
carrying forward the merge history of `my-cool-changes`. The original branch
remains available as the archival reference.

## Kept

- Conversation `[selfie]` markers remain visible in message content and
  history so editing and later model context retain the original command.
- Noodle manual post and reply generation, fast Nudge mode, reply vision
  fallback, current-time context, weaker-model prompting, and local-model JSON
  correction are replayed.
- Noodle image connection hints and image-prompt compiler behavior are
  replayed. Staging's existing LLM image-prompt generation is reused instead
  of duplicated.
- Group message scope and assistant/user attribution controls are replayed.
- Branch-specific generation, connection, prompt, roleplay, settings, and
  import changes present in the net archive diff are replayed.
- Shared schemas and types needed by the retained server and client behavior
  are replayed together with their implementations.

## Already In Staging

- Noodle timeline image prompts generated through the public generation flow.
- LLM-assisted selfie prompt generation and the Illustrator integration.
- The current service-based Noodle generation and correction architecture.
- Upstream agent background-generation behavior and other staging additions
  that were present at the clean branch base.

## Deferred: WebSim Extension

WebSim is intentionally absent from this branch. The archived integration
included the following host-coupled files, which were not replayed:

- `packages/client/src/components/chat/WebSimPanel.tsx`
- `packages/client/src/components/chat/ChatRoleplaySurface.tsx`
- `packages/client/src/components/chat/RoleplayHUD.tsx`
- `packages/client/src/hooks/use-generate.ts`
- `packages/client/src/stores/agent.store.ts`
- `packages/server/src/app.ts`
- `packages/server/src/routes/index.ts`
- `packages/server/src/routes/websim.routes.ts`
- `packages/shared/src/constants/agent-prompts.ts` WebSim entry
- `packages/shared/src/features/agents/websim/manifest.ts`
- `packages/shared/src/types/agent.ts` WebSim result types and ID

Future WebSim work should be implemented as a downloadable capability package
or extension. The extension boundary should own its browser panel, relay and
template routes, agent manifest and prompts, navigation state, observer
messages, and package-owned assets. Marinara Engine should only provide the
stable capability-package APIs, host registration, permissions, and lifecycle
hooks required by that extension.

## Validation Record

- Clean replay base: `origin/staging` at `f52d6a935`.
- Archived source: `my-cool-changes` at `ef2f72717`.
- Shared package build: passed after replay and WebSim cleanup.
- Server and client builds plus the full check remain required before this
  branch is considered ready.