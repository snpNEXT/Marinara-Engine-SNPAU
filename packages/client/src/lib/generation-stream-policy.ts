interface StreamHandoffInput {
  streamingEnabled: boolean;
  shouldDisplayRawStream: boolean;
  isGameGeneration: boolean;
  isRegeneration: boolean;
  isContinuation: boolean;
}

interface TypewriterReplacement {
  visibleText: string;
  pendingText: string;
}

interface TypewriterRevealRateInput {
  selectedCharsPerSecond: number;
  pendingCharacters: number;
  observedArrivalCharsPerSecond: number | null;
  streamComplete: boolean;
}

interface RoleplayTypewriterRevealRateInput {
  selectedCharsPerSecond: number;
  pendingCharacters: number;
  previousCharsPerSecond: number | null;
  elapsedMs: number;
  streamComplete: boolean;
}

interface GenerationSendBlockInput {
  streamActive: boolean;
  agentsProcessing: boolean;
  backgroundIllustration: boolean;
  delayedResponse?: boolean;
}

interface GenerationStartBlockInput {
  setupLocked: boolean;
  activeController: boolean;
  backgroundIllustration: boolean;
}

const ROLEPLAY_QUEUE_RESERVE_SECONDS = 0.9;
const ROLEPLAY_SLOWDOWN_RESPONSE_MS = 120;
const ROLEPLAY_SPEEDUP_RESPONSE_MS = 480;

/** Keep send actions guarded while leaving the draft field itself editable. */
export function isGenerationSendBlocked(input: GenerationSendBlockInput): boolean {
  return !input.backgroundIllustration && !input.delayedResponse && (input.streamActive || input.agentsProcessing);
}

/** An Illustrator-only SSE tail may coexist with the chat's next text generation. */
export function isGenerationStartBlocked(input: GenerationStartBlockInput): boolean {
  return input.setupLocked || (input.activeController && !input.backgroundIllustration);
}

/**
 * Keep the reveal slightly behind an open transport so provider-sized bursts
 * remain a continuous typewriter queue instead of draining into visible gaps.
 * Once transport completes, return to the user's selected speed so completion
 * is never artificially delayed.
 */
export function getTypewriterRevealCharsPerSecond(input: TypewriterRevealRateInput): number {
  if (!Number.isFinite(input.selectedCharsPerSecond) || input.streamComplete) {
    return input.selectedCharsPerSecond;
  }

  const arrivalRate = input.observedArrivalCharsPerSecond ?? input.pendingCharacters;
  const initialRateFloor =
    input.observedArrivalCharsPerSecond === null ? Math.min(12, input.selectedCharsPerSecond) : 1;
  return Math.max(initialRateFloor, Math.min(input.selectedCharsPerSecond, arrivalRate * 0.95));
}

/**
 * Pace Roleplay from one continuous reveal clock instead of mirroring the
 * provider's token bursts. The open-stream target leaves roughly a second of
 * text in the queue; asymmetric easing slows down quickly when that reserve
 * shrinks and speeds up gently when another provider chunk arrives.
 *
 * The user's selected speed remains the ceiling. Completion removes the queue
 * reserve, but still eases toward that ceiling so the final chunk cannot flash
 * in at a suddenly faster cadence.
 */
export function getRoleplayTypewriterRevealCharsPerSecond(input: RoleplayTypewriterRevealRateInput): number {
  if (!Number.isFinite(input.selectedCharsPerSecond)) return input.selectedCharsPerSecond;

  const minimumRate = Math.min(6, input.selectedCharsPerSecond);
  const queueSmoothedTarget = Math.max(
    minimumRate,
    input.pendingCharacters / ROLEPLAY_QUEUE_RESERVE_SECONDS,
  );
  const targetRate = input.streamComplete
    ? input.selectedCharsPerSecond
    : Math.min(input.selectedCharsPerSecond, queueSmoothedTarget);

  if (input.previousCharsPerSecond === null || !Number.isFinite(input.previousCharsPerSecond)) {
    return targetRate;
  }

  const responseTimeMs =
    targetRate < input.previousCharsPerSecond ? ROLEPLAY_SLOWDOWN_RESPONSE_MS : ROLEPLAY_SPEEDUP_RESPONSE_MS;
  const blend = 1 - Math.exp(-Math.max(0, input.elapsedMs) / responseTimeMs);
  return input.previousCharsPerSecond + (targetRate - input.previousCharsPerSecond) * blend;
}

/**
 * Reconcile an authoritative replacement with text that the typewriter has
 * already painted. Server cleanup can trim a leading newline, speaker label,
 * or thinking block after token streaming. Preserve the amount of text the
 * user has already read and keep the remainder queued instead of revealing the
 * complete cleaned response in one frame.
 */
export function reconcileTypewriterReplacement(
  visibleText: string,
  replacementText: string,
  retype = false,
): TypewriterReplacement {
  if (retype) return { visibleText: "", pendingText: replacementText };
  if (replacementText.startsWith(visibleText)) {
    return {
      visibleText,
      pendingText: replacementText.slice(visibleText.length),
    };
  }

  const preservedLength = Math.min(visibleText.length, replacementText.length);
  return {
    visibleText: replacementText.slice(0, preservedLength),
    pendingText: replacementText.slice(preservedLength),
  };
}

interface LiveStreamMessageShadowInput {
  hasLiveStream: boolean;
  regenerateMessageId: string | null;
  streamedMessageId: string | null;
  messageId: string;
}

/** Keep a saved assistant row from shadowing its still-active presentation row. */
export function isMessageShadowedByLiveStream(input: LiveStreamMessageShadowInput): boolean {
  return (
    input.hasLiveStream &&
    !input.regenerateMessageId &&
    input.streamedMessageId !== null &&
    input.messageId === input.streamedMessageId
  );
}

/**
 * Fresh Roleplay streams keep ownership of the visible transcript until the
 * entire SSE lifecycle has finished. The server persists the assistant message
 * before post-processing agents run, so handing off on `message_saved` would
 * replace the animated buffer with the completed database row mid-stream.
 */
export function shouldKeepStreamLiveThroughPostProcessing(input: StreamHandoffInput): boolean {
  return (
    input.streamingEnabled &&
    input.shouldDisplayRawStream &&
    !input.isGameGeneration &&
    !input.isRegeneration &&
    !input.isContinuation
  );
}
