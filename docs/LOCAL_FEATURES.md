# Local Feature Ledger

This file tracks features carried on replay or development branches that may not yet be present in `staging` or `main`. Update it when adding branch-local work, and verify each item after a staging merge.

## Current branch: `snpau-replay-from-staging`

Baseline: merge commit `0e346dec1` (previous `origin/staging` merge).

- Retired Noodle feature work (`34d5a6ab3`, `8805ef819`, plus earlier Noodle commits)
  - Focused generated posts and replies through the public Noodle flow.
  - Reply character selection, optional guided generation text, and post Fast Mode.
  - Public persistence, activity digest updates, and optional post image generation.
  - Also included Noodle generation controls, interaction controls, and NoodleR image prompting.
  - Staging extracted/removed the in-tree Noodle implementation into a separate feature package, so this work is intentionally not being carried through the merge.
  - Proposed future feature request: restore focused public Nudge post/reply generation, guided prompts, reply character selection, Fast Mode, public persistence, and optional image generation in the extracted Noodle package.
- Group message attribution and selfie marker handling (`f19c6c061`, `81c99a6e8`)
- Image prompt compilation and capability image-prompt hints (`259dedb53`, `913c2c6a`)
- Capability chat modes, browser surfaces, toolbar, and surface slots (`e590242b4`, `b3e468716`, `5f327fd21`)
- Generation prompt and provider compatibility/settings (`7f6316fee`, `faff0384d`, `efe3a66c9`)
- Selfie marker visibility and image-generation fixes (`52fab1ba7`, `8c0029b9e`)
- `generate.routes.ts` update (`85a4b877e`)

## Merge checklist

1. Before merging, confirm the worktree is clean and refresh `origin/staging`.
2. Compare local-only commits and changed files against the previous staging merge baseline.
3. Merge `origin/staging` rather than rebasing or resetting the branch.
4. If staging extracts a listed feature into a separate package, accept the extraction and update this ledger with the retired behavior and a feature-request description.
5. Run `pnpm check`, `pnpm localization:check`, and `git diff --check`.
6. Recheck this ledger against the resulting diff and update the baseline after the merge.
