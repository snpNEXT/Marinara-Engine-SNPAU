// ──────────────────────────────────────────────
// React Query: Noodle hooks
// ──────────────────────────────────────────────
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { useUIStore } from "../stores/ui.store";
import type {
  NoodleAccount,
  NoodleAccountFollowUpdateInput,
  NoodleAccountKind,
  NoodleAccountProfileUpdateInput,
  NoodleAccountSettingsPatchInput,
  NoodleAutoPostingIntensity,
  NoodleAutoPostRescheduleInput,
  NoodleBootstrap,
  NoodleCreateInteractionInput,
  NoodleCreatePostInput,
  NoodleInteraction,
  NoodleInteractionUpdateInput,
  NoodleNudgeInput,
  NoodlePost,
  NoodlePostUpdateInput,
  NoodlePrivatePostCreateInput,
  NoodlePrivatePostUpdateInput,
  NoodleRemoveInteractionInput,
  NoodleRescheduleRefreshInput,
  NoodleRefreshSchedulerStatus,
  NoodleSettings,
  NoodleSettingsUpdateInput,
  NoodleStageProfileInput,
  NoodlePrivateGenerationRequest,
  NoodleStageProfileDraftRequest,
  NoodlerManagedPost,
  NoodlerStageProfile,
  NoodlerManagedStageProfile,
  NoodlerSubscriber,
  NoodlerViewerScope,
  NoodlerCreateInteractionInput,
  NoodlerRemoveInteractionInput,
} from "@marinara-engine/shared";
import { mergeNoodlePollVoteInteractions } from "@marinara-engine/shared";
import type { ImagePromptOverride, ImagePromptReviewItem } from "../components/ui/ImagePromptReviewModal";

export type NoodleRefreshResult = {
  bootstrap: NoodleBootstrap;
  imagePromptReviewItems: ImagePromptReviewItem[];
};

export const noodleKeys = {
  all: ["noodle"] as const,
  bootstrap: () => [...noodleKeys.all, "bootstrap"] as const,
  privateRoot: () => [...noodleKeys.all, "private"] as const,
  privateAccounts: () => [...noodleKeys.privateRoot(), "accounts"] as const,
  privateEligibleAccountsRoot: () => [...noodleKeys.privateRoot(), "eligible"] as const,
  privateEligibleAccounts: (search: string, kind: string) =>
    [...noodleKeys.privateEligibleAccountsRoot(), search, kind] as const,
  privatePosts: (accountId: string) => [...noodleKeys.privateRoot(), "posts", accountId] as const,
  privateSubscribers: (accountId: string) => [...noodleKeys.privateRoot(), "subscribers", accountId] as const,
  privateViewers: () => [...noodleKeys.privateRoot(), "viewers"] as const,
  viewer: (personaId: string) => [...noodleKeys.privateViewers(), personaId] as const,
};

function preservePollVotes(current: NoodleBootstrap | undefined, next: NoodleBootstrap): NoodleBootstrap {
  if (!current) return next;
  const interactions = mergeNoodlePollVoteInteractions(current.interactions, next.posts, next.interactions);
  return interactions === next.interactions ? next : { ...next, interactions };
}

export function useNoodle(enabled = true) {
  return useQuery({
    queryKey: noodleKeys.bootstrap(),
    queryFn: () => api.get<NoodleBootstrap>("/noodle"),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
    structuralSharing: (current, next) =>
      preservePollVotes(current as NoodleBootstrap | undefined, next as NoodleBootstrap),
  });
}

export function useNoodlerAccounts(enabled = true) {
  return useQuery({
    queryKey: noodleKeys.privateAccounts(),
    queryFn: () => api.get<NoodlerManagedStageProfile[]>("/noodle/noodler/accounts"),
    enabled,
    staleTime: 10_000,
    // Autonomous scheduler writes managed-profile schedule state (nextRunAt) with no client
    // mutation; poll while the view is visible so an open creator page stays fresh.
    refetchInterval: enabled ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useNoodlerEligibleAccounts(search: string, kind: "all" | "character" | "persona", enabled = true) {
  const normalizedSearch = search.trim();
  return useInfiniteQuery({
    queryKey: noodleKeys.privateEligibleAccounts(normalizedSearch, kind),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<{ items: NoodleAccount[]; limit: number; offset: number; hasMore: boolean }>(
        `/noodle/noodler/eligible-accounts?limit=20&offset=${pageParam}&search=${encodeURIComponent(normalizedSearch)}${kind === "all" ? "" : `&kind=${kind}`}`,
      ),
    getNextPageParam: (page) => (page.hasMore ? page.offset + page.items.length : undefined),
    enabled,
    staleTime: 10_000,
  });
}

export function useNoodlerPosts(accountId: string | null) {
  return useQuery({
    queryKey: noodleKeys.privatePosts(accountId ?? "none"),
    queryFn: () => api.get<NoodlerManagedPost[]>(`/noodle/noodler/accounts/${encodeURIComponent(accountId!)}/posts`),
    enabled: Boolean(accountId),
    staleTime: 10_000,
    // Automatic posts are written server-side without a client mutation; poll while visible.
    refetchInterval: accountId ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useNoodlerSubscribers(accountId: string | null) {
  return useQuery({
    queryKey: noodleKeys.privateSubscribers(accountId ?? "none"),
    queryFn: () => api.get<NoodlerSubscriber[]>(`/noodle/noodler/accounts/${encodeURIComponent(accountId!)}/subscribers`),
    enabled: Boolean(accountId),
    staleTime: 10_000,
  });
}

export function useCreateNoodlerStageProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      publicAccountId,
      stageProfile,
    }: {
      publicAccountId: string;
      stageProfile: NoodleStageProfileInput;
    }) =>
      api.post<NoodlerStageProfile>(`/noodle/accounts/${encodeURIComponent(publicAccountId)}/private`, {
        stageProfile,
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateEligibleAccountsRoot() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]),
  });
}

export function useUpdateNoodlerStageProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, ...input }: { accountId: string } & NoodleStageProfileInput) =>
      api.put<NoodlerStageProfile>(`/noodle/noodler/accounts/${encodeURIComponent(accountId)}/stage-profile`, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]),
  });
}

export function useDeleteNoodlerStageProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      api.delete<NoodleAccount>(`/noodle/noodler/accounts/${encodeURIComponent(accountId)}`),
    onSuccess: (_account, accountId) => {
      qc.removeQueries({ queryKey: noodleKeys.privatePosts(accountId) });
      return Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateEligibleAccountsRoot() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]);
    },
  });
}

export function useGenerateNoodlerStageProfileDraft() {
  return useMutation({
    mutationFn: (input: NoodleStageProfileDraftRequest) => {
      const controller = new AbortController();
      // ponytail: fixed 60s ceiling, no per-provider tuning — raise if real drafts routinely take longer
      const timer = setTimeout(() => controller.abort(), 60_000);
      return api
        .post<NoodleStageProfileInput>("/noodle/noodler/stage-profile-draft", input, {
          signal: controller.signal,
        })
        .finally(() => clearTimeout(timer));
    },
  });
}

export function useGeneratePrivateNoodlePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoodlePrivateGenerationRequest) =>
      api.post<NoodlerManagedPost>("/noodle/refresh", {
        ...input,
        debugMode: useUIStore.getState().debugMode,
      } satisfies NoodlePrivateGenerationRequest),
    onSuccess: (_post, input) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privatePosts(input.targetAccountId) }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]),
  });
}

export function useCreateNoodlerPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoodlePrivatePostCreateInput) => api.post<NoodlerManagedPost>("/noodle/noodler/posts", input),
    onSuccess: (_post, input) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privatePosts(input.targetAccountId) }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]),
  });
}

export function useNoodlerViewer(personaId: string | null, enabled = true) {
  return useQuery({
    queryKey: noodleKeys.viewer(personaId ?? "none"),
    queryFn: () => api.get<NoodlerViewerScope>(`/noodle/noodler/viewer?personaId=${encodeURIComponent(personaId!)}`),
    enabled: enabled && Boolean(personaId),
    staleTime: 10_000,
    // Automatic posts change subscriber-visible projections server-side; poll while visible.
    refetchInterval: enabled && personaId ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useToggleNoodlerSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      creatorAccountId,
      personaId,
      subscribed,
    }: {
      creatorAccountId: string;
      personaId: string;
      subscribed: boolean;
    }) =>
      subscribed
        ? api.delete<{ ok: true }>(
            `/noodle/noodler/accounts/${encodeURIComponent(creatorAccountId)}/subscribe?personaId=${encodeURIComponent(personaId)}`,
          )
        : api.post(`/noodle/noodler/accounts/${encodeURIComponent(creatorAccountId)}/subscribe`, { personaId }),
    onSuccess: (_result, input) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.viewer(input.personaId) }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateSubscribers(input.creatorAccountId) }),
      ]),
  });
}

export function useUnlockNoodlerPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, personaId }: { postId: string; personaId: string }) =>
      api.post(`/noodle/noodler/posts/${encodeURIComponent(postId)}/unlock`, { personaId }),
    onSuccess: (_result, input) => qc.invalidateQueries({ queryKey: noodleKeys.viewer(input.personaId) }),
  });
}

export function useCreateNoodlerInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, ...input }: { postId: string } & NoodlerCreateInteractionInput) =>
      api.post<NoodleInteraction>(`/noodle/noodler/posts/${encodeURIComponent(postId)}/interactions`, input),
    onSuccess: (_result, input) => qc.invalidateQueries({ queryKey: noodleKeys.viewer(input.personaId) }),
  });
}

export function useRemoveNoodlerInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, ...input }: { postId: string } & NoodlerRemoveInteractionInput) => {
      const params = new URLSearchParams({ personaId: input.personaId, type: input.type });
      if (input.parentInteractionId) params.set("parentInteractionId", input.parentInteractionId);
      return api.delete<NoodleInteraction>(
        `/noodle/noodler/posts/${encodeURIComponent(postId)}/interactions?${params}`,
      );
    },
    onSuccess: (_result, input) => qc.invalidateQueries({ queryKey: noodleKeys.viewer(input.personaId) }),
  });
}

export function useUpdateNoodlerPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accountId: _accountId, ...input }: { id: string; accountId: string } & NoodlePrivatePostUpdateInput) =>
      api.patch<NoodlerManagedPost>(`/noodle/noodler/posts/${encodeURIComponent(id)}`, input),
    onSuccess: (_post, input) => {
      return Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privatePosts(input.accountId) }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]);
    },
  });
}

export function useDeleteNoodlerPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; accountId: string }) =>
      api.delete<NoodlerManagedPost>(`/noodle/noodler/posts/${encodeURIComponent(id)}`),
    onSuccess: (_post, input) => {
      return Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privatePosts(input.accountId) }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]);
    },
  });
}

export function useUpdateNoodlerAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      ...access
    }: {
      accountId: string;
      hiddenFromAccountIds: string[];
      subscriptionIncludesPpv: boolean;
    }) =>
      api.patch<NoodleAccount>(`/noodle/accounts/${encodeURIComponent(accountId)}/settings`, {
        subtree: "privacy",
        patch: { access },
      } satisfies NoodleAccountSettingsPatchInput),
    onSuccess: () => {
      return Promise.all([
        qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
        qc.invalidateQueries({ queryKey: noodleKeys.privateViewers() }),
      ]);
    },
  });
}

export function useUpdateNoodlerAutoPosting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      ...autoPosting
    }: {
      accountId: string;
      enabled?: boolean;
      intensity?: NoodleAutoPostingIntensity;
    }) =>
      api.patch<NoodleAccount>(`/noodle/accounts/${encodeURIComponent(accountId)}/settings`, {
        subtree: "scheduler",
        patch: { autoPosting },
      } satisfies NoodleAccountSettingsPatchInput),
    // Auto-post state lives only under privateAccounts(); the /noodle bootstrap has none of it.
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
  });
}

export function useRescheduleNoodlerAutoPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, ...input }: { accountId: string } & NoodleAutoPostRescheduleInput) =>
      api.put<NoodleAccount>(`/noodle/noodler/accounts/${encodeURIComponent(accountId)}/auto-post/schedule`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.privateAccounts() }),
  });
}

export function useUpdateNoodleSettings() {
  const qc = useQueryClient();
  return useMutation({
    scope: { id: "noodle-settings" },
    mutationFn: (settings: NoodleSettingsUpdateInput) => api.put<NoodleSettings>("/noodle/settings", settings),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: noodleKeys.bootstrap() });
      const previous = qc.getQueryData<NoodleBootstrap>(noodleKeys.bootstrap());
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              settings: { ...current.settings, ...patch } as NoodleSettings,
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) qc.setQueryData(noodleKeys.bootstrap(), context.previous);
    },
    onSuccess: (settings) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current ? { ...current, settings } : current,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useRescheduleNoodleRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoodleRescheduleRefreshInput) =>
      api.put<NoodleRefreshSchedulerStatus>("/noodle/refresh-schedule", input),
    onSuccess: (scheduler) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current ? { ...current, scheduler } : current,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useUpdateNoodleAccountProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & NoodleAccountProfileUpdateInput) =>
      api.put<NoodleAccount>(`/noodle/accounts/${id}/profile`, input),
    onSuccess: (account) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? { ...current, accounts: current.accounts.map((item) => (item.id === account.id ? account : item)) }
          : current,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function usePatchNoodleAccountSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & NoodleAccountSettingsPatchInput) =>
      api.patch<NoodleAccount>(`/noodle/accounts/${id}/settings`, input),
    onSuccess: (account) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              accounts: current.accounts.map((item) => (item.id === account.id ? account : item)),
            }
          : current,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useUpdateNoodleAccountFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      targetAccountId,
      ...input
    }: { id: string; targetAccountId: string } & NoodleAccountFollowUpdateInput) =>
      api.patch<NoodleAccount>(`/noodle/accounts/${id}/follows/${targetAccountId}`, input),
    onSuccess: (account) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? { ...current, accounts: current.accounts.map((item) => (item.id === account.id ? account : item)) }
          : current,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useInviteNoodleCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (characterId: string) => api.post<NoodleAccount>("/noodle/invites", { characterId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useInviteNoodleCharacters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (characterIds: string[]) => api.post<NoodleAccount[]>("/noodle/invites/bulk", { characterIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useRemoveNoodleCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (characterId: string) =>
      api.delete<NoodleAccount>(`/noodle/invites/${encodeURIComponent(characterId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useClearNoodleInvites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<NoodleBootstrap>("/noodle/invites"),
    onSuccess: (bootstrap) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current ? preservePollVotes(current, bootstrap) : bootstrap,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useNudgeNoodleCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoodleNudgeInput) => api.post<NoodleBootstrap>("/noodle/nudge", input),
    onSuccess: (bootstrap) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current ? preservePollVotes(current, bootstrap) : bootstrap,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useCreateNoodlePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NoodleCreatePostInput) => api.post<NoodlePost>("/noodle/posts", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useUpdateNoodlePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & NoodlePostUpdateInput) =>
      api.patch<NoodlePost>(`/noodle/posts/${encodeURIComponent(id)}`, input),
    onSuccess: (post) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              posts: current.posts.map((item) => (item.id === post.id ? post : item)),
            }
          : current,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useDeleteNoodlePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<NoodlePost>(`/noodle/posts/${encodeURIComponent(id)}`),
    onSuccess: (post) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              posts: current.posts.filter((item) => item.id !== post.id),
              interactions: current.interactions.filter((interaction) => interaction.postId !== post.id),
              digests: current.digests.filter((digest) => digest.sourcePostId !== post.id),
            }
          : current,
      );
      qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() });
    },
  });
}

export function useResetNoodleTimeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<NoodleBootstrap>("/noodle/timeline"),
    onSuccess: (bootstrap) => qc.setQueryData(noodleKeys.bootstrap(), bootstrap),
    onSettled: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useCreateNoodleInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      ...input
    }: NoodleCreateInteractionInput & {
      postId: string;
      actorKind: NoodleAccountKind;
      actorEntityId: string;
    }) => api.post<NoodleInteraction>(`/noodle/posts/${postId}/interactions`, input),
    onSuccess: (interaction) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              interactions: current.interactions.some((item) => item.id === interaction.id)
                ? current.interactions.map((item) => (item.id === interaction.id ? interaction : item))
                : [...current.interactions, interaction],
            }
          : current,
      );
    },
  });
}

export function useRemoveNoodleInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      ...input
    }: NoodleRemoveInteractionInput & {
      postId: string;
      actorKind: NoodleAccountKind;
      actorEntityId: string;
    }) => {
      const params = new URLSearchParams({
        actorKind: input.actorKind,
        actorEntityId: input.actorEntityId,
        type: input.type,
      });
      if (input.parentInteractionId) params.set("parentInteractionId", input.parentInteractionId);
      return api.delete<NoodleInteraction>(`/noodle/posts/${encodeURIComponent(postId)}/interactions?${params}`);
    },
    onSuccess: (interaction) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              interactions: current.interactions.filter((item) => item.id !== interaction.id),
            }
          : current,
      );
    },
  });
}

export function useUpdateNoodleInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      postId,
      interactionId,
      ...input
    }: NoodleInteractionUpdateInput & { postId: string; interactionId: string }) =>
      api.patch<NoodleInteraction>(
        `/noodle/posts/${encodeURIComponent(postId)}/interactions/${encodeURIComponent(interactionId)}`,
        input,
      ),
    onSuccess: (interaction) => {
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              interactions: current.interactions.map((item) => (item.id === interaction.id ? interaction : item)),
            }
          : current,
      );
    },
  });
}

export function useDeleteNoodleInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, interactionId, personaId }: { postId: string; interactionId: string; personaId: string }) =>
      api.delete<NoodleInteraction[]>(
        `/noodle/posts/${encodeURIComponent(postId)}/interactions/${encodeURIComponent(interactionId)}?personaId=${encodeURIComponent(personaId)}`,
      ),
    onSuccess: (interactions) => {
      const deletedIds = new Set(interactions.map((interaction) => interaction.id));
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        current
          ? {
              ...current,
              interactions: current.interactions.filter((item) => !deletedIds.has(item.id)),
            }
          : current,
      );
    },
  });
}

export function useRefreshNoodle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { personaId?: string; connectionId?: string }) =>
      api.post<NoodleRefreshResult>("/noodle/refresh", {
        mode: "public",
        ...input,
        timeZone: useUIStore.getState().conversationTimeZone,
        debugMode: useUIStore.getState().debugMode,
        reviewImagePromptsBeforeSend: useUIStore.getState().reviewImagePromptsBeforeSend,
      }),
    onSuccess: (result) =>
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        preservePollVotes(current, result.bootstrap),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}

export function useConfirmNoodleImagePrompts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prompts: ImagePromptOverride[]) =>
      api.post<NoodleBootstrap>("/noodle/refresh/images", {
        prompts,
        debugMode: useUIStore.getState().debugMode,
      }),
    onSuccess: (bootstrap) =>
      qc.setQueryData<NoodleBootstrap | undefined>(noodleKeys.bootstrap(), (current) =>
        preservePollVotes(current, bootstrap),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: noodleKeys.bootstrap() }),
  });
}
