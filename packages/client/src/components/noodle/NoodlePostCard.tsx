import {
  AtSign,
  Check,
  Heart,
  Image as ImageIcon,
  ListChecks,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  canManageNoodleReply,
  findNoodleTextMentions,
  readNoodlePollFromMetadata,
  type NoodleAccount,
  type NoodleAuthorSnapshot,
  type NoodleInteraction,
  type NoodleInteractionType,
  type NoodlePoll,
  type NoodlePost,
  type NoodleTextMention,
} from "@marinara-engine/shared";
import { cn } from "../../lib/utils";
import { renderInlineWithCustomEmojis } from "../../lib/custom-emoji-render";
import {
  ConversationMediaPickerPanel,
  type ConversationMediaPickerTab,
  type ConversationMediaPickerTabId,
} from "../chat/ConversationMediaPickerPanel";
import type { ChatImage } from "../../hooks/use-gallery";
import { Avatar, NOODLE_ICON_SCOPE_CLASS, useNoodleAccent } from "./NoodleShell";
import { formatTime } from "./NoodleBrowserChrome";

const fieldClass =
  "mari-chrome-field h-9 w-full min-w-0 rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] px-3 text-xs text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
const textareaClass =
  "mari-chrome-field min-h-24 w-full min-w-0 resize-y rounded-md border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] p-3 text-xs leading-relaxed text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-blue)]";
const labelClass =
  "text-[0.68rem] font-semibold uppercase tracking-normal text-[var(--marinara-chat-chrome-panel-muted)]";
export const noodleIconButtonClass =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium !text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:!text-[var(--noodle-blue)]";
const NOODLE_MEDIA_PICKER_TABS: ConversationMediaPickerTab[] = [
  { id: "emoji", label: "Emoji" },
  { id: "gifs", label: "GIFs" },
  { id: "stickers", label: "Stickers" },
];
const NOODLE_TEXT_MEDIA_PICKER_TABS: ConversationMediaPickerTab[] = [
  { id: "emoji", label: "Emoji" },
  { id: "stickers", label: "Stickers" },
];
type ReplyComposerTool = "image" | "media";
type ActiveComposerMention = NoodleTextMention & { query: string };

export function NoodleCustomEmojiText({
  text,
  emojiMap,
  keyPrefix,
}: {
  text: string;
  emojiMap: Map<string, string>;
  keyPrefix: string;
}) {
  return (
    <>
      {renderInlineWithCustomEmojis(text, keyPrefix, emojiMap, (segment, key) => [
        <Fragment key={key}>{segment}</Fragment>,
      ])}
    </>
  );
}
export function insertAtSelection(value: string, insertion: string, start: number, end: number) {
  const boundedStart = Math.max(0, Math.min(start, value.length));
  const boundedEnd = Math.max(boundedStart, Math.min(end, value.length));
  return {
    value: value.slice(0, boundedStart) + insertion + value.slice(boundedEnd),
    caret: boundedStart + insertion.length,
  };
}

export function NoodleMentionSuggestions({
  activeMention,
  activeIndex,
  accounts,
  listboxId,
  onSelect,
}: {
  activeMention: ActiveComposerMention | null;
  activeIndex: number;
  accounts: NoodleAccount[];
  listboxId: string;
  onSelect: (account: NoodleAccount) => void;
}) {
  if (!activeMention) return null;
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Tag a character"
      className="relative z-40 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--noodle-divider)] bg-[var(--background)] p-1 shadow-xl shadow-black/25"
    >
      {accounts.length > 0 ? (
        accounts.map((account, index) => (
          <button
            key={account.id}
            id={`${listboxId}-option-${index}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => onSelect(account)}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors",
              index === activeIndex ? "bg-[var(--noodle-blue)]/15" : "hover:bg-[var(--noodle-blue)]/10",
            )}
          >
            <Avatar account={account} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{account.displayName}</span>
              <span className="block truncate text-[0.68rem] text-[var(--noodle-blue)]">@{account.handle}</span>
            </span>
          </button>
        ))
      ) : (
        <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
          No invited character matches @{activeMention.query}.
        </p>
      )}
    </div>
  );
}

function NoodleTextContent({
  content,
  accountByHandle,
  onOpenProfile,
  className,
}: {
  content: string;
  accountByHandle: Map<string, NoodleAccount>;
  onOpenProfile: (account: NoodleAccount) => void;
  className?: string;
}) {
  const mentions = findNoodleTextMentions(content);
  if (mentions.length === 0) {
    return <p className={cn("whitespace-pre-wrap text-sm", className)}>{content}</p>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const mention of mentions) {
    if (mention.start > cursor) parts.push(content.slice(cursor, mention.start));
    const label = content.slice(mention.start, mention.end);
    const account = accountByHandle.get(mention.handle);
    parts.push(
      account ? (
        <button
          key={`${mention.start}:${mention.handle}`}
          type="button"
          onClick={() => onOpenProfile(account)}
          className="inline font-semibold text-[var(--noodle-blue)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70"
          aria-label={`View @${account.handle} profile`}
        >
          {label}
        </button>
      ) : (
        label
      ),
    );
    cursor = mention.end;
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return <p className={cn("whitespace-pre-wrap text-sm", className)}>{parts}</p>;
}

function NoodlePollCard({
  poll,
  votes,
  accountById,
  selectedOptionId,
  disabled,
  pending,
  onVote,
  onOpenProfile,
}: {
  poll: NoodlePoll;
  votes: NoodleInteraction[];
  accountById: Map<string, NoodleAccount>;
  selectedOptionId: string | null;
  disabled: boolean;
  pending: boolean;
  onVote: (optionId: string) => void;
  onOpenProfile: (account: NoodleAccount) => void;
}) {
  const totalVotes = votes.length;
  const [showVoters, setShowVoters] = useState(false);
  return (
    <section className="mt-3" aria-label={`Poll: ${poll.question}`} data-noodle-poll>
      <h3 className="text-sm font-bold leading-5">{poll.question}</h3>
      <div className="mt-2 space-y-2">
        {poll.options.map((option) => {
          const matchingVotes = votes.filter((vote) => vote.content === option.id);
          const optionVotes = matchingVotes.length;
          const percentage = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
          const selected = selectedOptionId === option.id;
          return (
            <Fragment key={option.id}>
              <button
              type="button"
              onClick={() => onVote(option.id)}
              disabled={disabled || pending}
              aria-pressed={selected}
              aria-label={`${option.label}, ${optionVotes} ${optionVotes === 1 ? "vote" : "votes"}, ${percentage}%`}
              className={cn(
                "relative flex min-h-10 w-full items-center overflow-hidden rounded-lg border px-3 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed",
                selected
                  ? "border-[var(--noodle-blue)] bg-[var(--noodle-blue)]/10"
                  : "border-[var(--noodle-divider)] hover:border-[var(--noodle-blue)]/55 hover:bg-[var(--noodle-blue)]/5",
              )}
              data-noodle-poll-option={option.id}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 origin-left bg-[var(--noodle-blue)]/15 transition-transform duration-300 ease-out"
                style={{ transform: `scaleX(${percentage / 100})` }}
              />
              <span className="relative flex min-w-0 flex-1 items-center gap-2">
                {selected && <Check size={14} className="shrink-0 text-[var(--noodle-blue)]" />}
                <span className="min-w-0 flex-1 break-words">{option.label}</span>
                <span className="shrink-0 text-[var(--muted-foreground)]">{percentage}%</span>
              </span>
              </button>
              {showVoters && optionVotes > 0 && (
                <div className="flex flex-wrap gap-1 px-1" aria-label={`Voters for ${option.label}`}>
                  {matchingVotes.map((vote) => {
                    const voterAccount = accountById.get(vote.actorAccountId) ?? null;
                    const voter = voterAccount ?? vote.actorSnapshot;
                    return voter ? (
                      <button
                        key={vote.id}
                        type="button"
                        onClick={() => {
                          if (voterAccount) onOpenProfile(voterAccount);
                        }}
                        disabled={!voterAccount}
                        className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-[var(--noodle-blue)]/8 pr-2 text-[0.6875rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--noodle-blue)]/15 hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70 disabled:cursor-default"
                      >
                        <Avatar account={voter} size="sm" />
                        <span className="max-w-32 truncate">@{voter.handle}</span>
                      </button>
                    ) : null;
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setShowVoters((visible) => !visible)}
        aria-expanded={showVoters}
        className="mt-2 rounded-sm text-[0.68rem] text-[var(--muted-foreground)] transition-colors hover:text-[var(--noodle-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70"
      >
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        {selectedOptionId ? " · You voted" : ""}
        {pending ? " · Saving…" : ""}
        {totalVotes > 0 ? (showVoters ? " · Hide voters" : " · View voters") : ""}
      </button>
    </section>
  );
}

function countInteractions(interactions: NoodleInteraction[], type: NoodleInteractionType) {
  return interactions.filter((interaction) => interaction.type === type).length;
}

function createNoodleLightboxImage(id: string, url: string, prompt = ""): ChatImage {
  const filename = url.split("?")[0]?.split("/").pop();
  const safeFilename = filename && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(filename) ? filename : `noodle-${id}.png`;
  return {
    id,
    chatId: "noodle",
    filePath: safeFilename,
    prompt,
    provider: "",
    model: "",
    width: null,
    height: null,
    createdAt: "",
    url,
  };
}

export function NoodleToolButton({
  active,
  title,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 !text-[var(--noodle-blue)] transition-colors active:scale-95 [&_svg]:!text-[var(--noodle-blue)]",
        disabled
          ? "cursor-not-allowed opacity-40"
          : active
            ? "bg-[var(--noodle-blue)]/15 ring-1 ring-[var(--noodle-blue)]/25"
            : "hover:bg-[var(--noodle-blue)]/10",
      )}
    >
      {children}
    </button>
  );
}

type NoodleComposerTool = { ref?: RefObject<HTMLDivElement | null>; active?: boolean; disabled?: boolean; onClick?: () => void };

// Shared composer icon row (image / poll / emoji) so every Noodle surface renders
// the identical toolbar. NoodleR disables image/poll (no attach path) and passes
// a trailing coin control for monetization settings.
export function NoodleComposerToolRow({
  image,
  poll,
  media,
  trailing,
}: {
  image: NoodleComposerTool;
  poll: NoodleComposerTool;
  media: NoodleComposerTool;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <div ref={image.ref} className="relative">
        <NoodleToolButton
          title="Attach image"
          active={Boolean(image.active)}
          disabled={image.disabled}
          onClick={() => image.onClick?.()}
        >
          <ImageIcon size={18} />
        </NoodleToolButton>
      </div>
      <div ref={poll.ref} className="relative">
        <NoodleToolButton
          title={poll.active ? "Edit poll" : "Create poll"}
          active={Boolean(poll.active)}
          disabled={poll.disabled}
          onClick={() => poll.onClick?.()}
        >
          <ListChecks size={18} />
        </NoodleToolButton>
      </div>
      <div ref={media.ref} className="relative">
        <NoodleToolButton
          title="Emoji, GIFs and stickers"
          active={Boolean(media.active)}
          disabled={media.disabled}
          onClick={() => media.onClick?.()}
        >
          <Smile size={18} />
        </NoodleToolButton>
      </div>
      {trailing}
    </>
  );
}

export function NoodleAnchoredPopover({
  anchorRef,
  children,
  wide,
  modalOwned = false,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  wide?: boolean;
  modalOwned?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const accent = useNoodleAccent();

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const panelWidth = panelRef.current?.offsetWidth ?? (wide ? 384 : 304);
      const padding = 16;
      const maxLeft = Math.max(padding, window.innerWidth - panelWidth - padding);
      const centeredLeft = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
      setPosition({
        left: Math.min(Math.max(centeredLeft, padding), maxLeft),
        top: anchorRect.bottom + 12,
      });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, wide]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      data-noodle-compose-focus-portal={modalOwned ? "true" : undefined}
      className={cn(
        "fixed max-w-[calc(100vw-2rem)]",
        modalOwned ? "z-[10001]" : "z-[80]",
        NOODLE_ICON_SCOPE_CLASS,
        wide ? "w-[18rem] sm:w-[24rem]" : "w-[19rem]",
      )}
      style={
        {
          "--noodle-blue": accent,
          "--noodle-divider": "var(--marinara-chat-chrome-panel-divider)",
          left: position?.left ?? -9999,
          top: position?.top ?? -9999,
          opacity: position ? 1 : 0,
        } as CSSProperties
      }
    >
      {children}
    </div>,
    document.body,
  );
}

export function NoodleToolPopover({
  title,
  onClose,
  children,
  wide,
  anchorRef,
  modalOwned,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  modalOwned?: boolean;
}) {
  return (
    <NoodleAnchoredPopover anchorRef={anchorRef} wide={wide} modalOwned={modalOwned}>
      <div className="marinara-chat-popover flex h-[22rem] max-h-[60vh] flex-col overflow-hidden rounded-xl border border-[var(--marinara-chat-chrome-panel-border)] bg-[var(--background)] text-[var(--foreground)] shadow-2xl shadow-black/35">
        <div className="flex shrink-0 items-center gap-1 border-b border-foreground/10 px-2 py-1.5">
          <span className="flex-1 rounded-md bg-foreground/10 px-2 py-1 text-center text-xs font-medium text-foreground/80 ring-1 ring-foreground/15">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--noodle-blue)] transition-colors hover:bg-foreground/10"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </NoodleAnchoredPopover>
  );
}

/**
 * Reply image attach/upload/lightbox. Hosts that persist reply images pass this; hosts that
 * don't (NoodleR) omit it — the card then hides the attach-image tool, upload, GIF tab, and
 * lightbox instead of the host having to pass discarded setters and dangling refs.
 */
interface NoodlePostCardMediaCap {
  setImageLightbox: React.Dispatch<React.SetStateAction<ChatImage | null>>;
  replyImageUrl: string;
  setReplyImageUrl: React.Dispatch<React.SetStateAction<string>>;
  replyImageUrlDraft: string;
  setReplyImageUrlDraft: React.Dispatch<React.SetStateAction<string>>;
  replyImageToolRef: RefObject<HTMLDivElement | null>;
  replyImageFileRef: RefObject<HTMLInputElement | null>;
  applyReplyImageUrl: () => void;
  uploadGlobalImages: { isPending: boolean };
}

/** Editing/deleting replies. Omit on hosts without a reply-management path (NoodleR). */
interface NoodlePostCardReplyManagementCap {
  editingReplyId: string | null;
  editingReplyContent: string;
  setEditingReplyContent: React.Dispatch<React.SetStateAction<string>>;
  startEditingReply: (reply: NoodleInteraction) => void;
  cancelEditingReply: () => void;
  saveEditedReply: (post: NoodlePostCardModel, reply: NoodleInteraction) => void;
  deleteNoodleReply: (post: NoodlePostCardModel, reply: NoodleInteraction) => void;
  updateInteraction: { isPending: boolean };
  deleteInteraction: { isPending: boolean };
  /** Gate reply Edit/Delete. Omit for the default author-based check. */
  canManageReply?: (reply: NoodleInteraction) => boolean;
}

/** @mention autocomplete in the reply composer. Omit on hosts without mentions (NoodleR). */
interface NoodlePostCardMentionsCap {
  activeReplyMention: ActiveComposerMention | null;
  activeReplyMentionIndex: number;
  replyMentionSuggestions: NoodleAccount[];
  selectReplyMention: (account: NoodleAccount) => void;
}

type NoodlePostCardAuthor = Pick<
  NoodleAuthorSnapshot,
  "id" | "handle" | "displayName" | "avatarUrl" | "avatarCrop"
>;
export type NoodlePostCardModel = Pick<
  NoodlePost,
  "id" | "authorAccountId" | "content" | "imageUrl" | "imagePrompt" | "metadata" | "createdAt"
> & {
  title: string | null;
  authorSnapshot: NoodlePostCardAuthor | null;
  interactions: NoodleInteraction[];
};

interface NoodlePostCardTitleEditingCap {
  editingPostTitle: string;
  setEditingPostTitle: React.Dispatch<React.SetStateAction<string>>;
  maxLength: number;
}

interface NoodlePostCardCtx {
  accountById?: Map<string, NoodleAccount>;
  accountByHandle?: Map<string, NoodleAccount>;
  personaAccount: NoodleAccount | null;
  postMenuId: string | null;
  setPostMenuId: React.Dispatch<React.SetStateAction<string | null>>;
  editingPostId: string | null;
  editingPostContent: string;
  setEditingPostContent: React.Dispatch<React.SetStateAction<string>>;
  replyPostId: string | null;
  replyParentInteractionId: string | null;
  replyText: string;
  replyHasText: boolean;
  setReplyText: React.Dispatch<React.SetStateAction<string>>;
  activeReplyComposerTool: ReplyComposerTool | null;
  setActiveReplyComposerTool: React.Dispatch<React.SetStateAction<ReplyComposerTool | null>>;
  highlightedInteractionId: string | null;
  mediaPickerTab: ConversationMediaPickerTabId;
  setMediaPickerTab: React.Dispatch<React.SetStateAction<ConversationMediaPickerTabId>>;
  replyComposerRef: RefObject<HTMLTextAreaElement | null>;
  replyValueRef: RefObject<string>;
  replyMediaToolRef: RefObject<HTMLDivElement | null>;
  startEditingPost: (post: NoodlePostCardModel) => void;
  deleteNoodlePost: (post: NoodlePostCardModel) => void;
  cancelEditingPost: () => void;
  saveEditedPost: (post: NoodlePostCardModel) => void;
  reactToPost: (post: NoodlePostCardModel, type: "like" | "repost", active?: boolean) => void;
  reactToReply: (post: NoodlePostCardModel, target: NoodleInteraction, active: boolean) => void;
  openReplyComposer: (postId: string, parentInteractionId?: string | null) => void;
  handleReplyChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Reply composer keydown (mention nav / submit shortcuts). Omit on hosts without them. */
  handleReplyKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  clearReplyComposer: () => void;
  submitReply: (post: NoodlePostCardModel) => void;
  appendToReply: (text: string) => void;
  reactionPendingFor: (postId: string, type: "like" | "repost", parentInteractionId?: string | null) => boolean;
  createInteractionPendingFor: (postId: string, type: NoodleInteractionType, parentInteractionId?: string | null) => boolean;
  updatePostPending: boolean;
  /** Human controller edit/delete capability. Viewer-only projections set this false. */
  postManagement: boolean;
  /** Private-title editing. Public Noodle omits this capability and remains titleless. */
  titleEditing?: NoodlePostCardTitleEditingCap;
  /** Navigate to an author/mention profile. Omit on hosts without profile navigation (NoodleR). */
  openProfile?: (account: NoodleAccount | null) => void;
  /** Navigate by private author ID when no public account object exists. */
  openAuthorProfile?: (accountId: string) => void;
  /** Vote in a post's poll. Omit on hosts without polls (NoodleR); pollless posts never call it. */
  voteInPoll?: (post: NoodlePostCardModel, optionId: string, selectedOptionId: string | null) => void;
  /** Reply image/upload capability. Absent → the card hides all reply-image affordances. */
  media?: NoodlePostCardMediaCap;
  /** Reply edit/delete capability. Absent → reply management UI stays hidden. */
  replyManagement?: NoodlePostCardReplyManagementCap;
  /** @mention autocomplete capability. Absent → no mention suggestions. */
  mentions?: NoodlePostCardMentionsCap;
}

interface NoodlePostCardControllerOptions {
  postManagement: boolean;
  personaAccount: NoodleAccount | null;
  savePost: (post: NoodlePostCardModel, input: { title: string | null; content: string }) => Promise<void>;
  deletePost: (post: NoodlePostCardModel) => void;
  reactToPost: (post: NoodlePostCardModel, type: "like" | "repost", active?: boolean) => void;
  reactToReply: (post: NoodlePostCardModel, target: NoodleInteraction, active: boolean) => void;
  submitReply: (
    post: NoodlePostCardModel,
    input: { content: string; parentInteractionId: string | null },
  ) => Promise<void>;
  reactionPendingFor: (postId: string, type: "like" | "repost", parentInteractionId?: string | null) => boolean;
  createInteractionPendingFor: (
    postId: string,
    type: NoodleInteractionType,
    parentInteractionId?: string | null,
  ) => boolean;
  updatePostPending: boolean;
  titleMaxLength?: number;
  openAuthorProfile?: (accountId: string) => void;
}

export function useNoodlePostCardController(options: NoodlePostCardControllerOptions) {
  const [postMenuId, setPostMenuId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [editingPostTitle, setEditingPostTitle] = useState("");
  const [replyPostId, setReplyPostId] = useState<string | null>(null);
  const [replyParentInteractionId, setReplyParentInteractionId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyHasText, setReplyHasText] = useState(false);
  const [activeReplyComposerTool, setActiveReplyComposerTool] = useState<ReplyComposerTool | null>(null);
  const [mediaPickerTab, setMediaPickerTab] = useState<ConversationMediaPickerTabId>("emoji");
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const replyValueRef = useRef("");
  const replyMediaToolRef = useRef<HTMLDivElement | null>(null);

  const clearReplyComposer = () => {
    setReplyPostId(null);
    setReplyParentInteractionId(null);
    setReplyText("");
    replyValueRef.current = "";
    setReplyHasText(false);
    setActiveReplyComposerTool(null);
    if (replyComposerRef.current) replyComposerRef.current.value = "";
  };
  const cancelEditingPost = () => {
    setEditingPostId(null);
    setEditingPostContent("");
    setEditingPostTitle("");
  };
  const reset = () => {
    clearReplyComposer();
    setPostMenuId(null);
    cancelEditingPost();
  };
  const openReplyComposer = (postId: string, parentInteractionId: string | null = null) => {
    clearReplyComposer();
    setReplyPostId(postId);
    setReplyParentInteractionId(parentInteractionId);
  };
  const handleReplyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    replyValueRef.current = event.target.value;
    setReplyHasText(event.target.value.trim().length > 0);
  };
  const appendToReply = (text: string) => {
    const next = replyValueRef.current + text;
    replyValueRef.current = next;
    setReplyText(next);
    setReplyHasText(next.trim().length > 0);
    if (replyComposerRef.current) replyComposerRef.current.value = next;
  };
  const startEditingPost = (post: NoodlePostCardModel) => {
    setPostMenuId(null);
    setEditingPostId(post.id);
    setEditingPostTitle(post.title ?? "");
    setEditingPostContent(post.content);
  };
  const saveEditedPost = (post: NoodlePostCardModel) => {
    const content = editingPostContent.trim();
    if (!content) return;
    void options
      .savePost(post, { title: editingPostTitle.trim() || null, content })
      .then(cancelEditingPost)
      .catch(() => {});
  };
  const submitReply = (post: NoodlePostCardModel) => {
    const content = replyValueRef.current.trim();
    if (!content) return;
    void options
      .submitReply(post, { content, parentInteractionId: replyParentInteractionId })
      .then(clearReplyComposer)
      .catch(() => {});
  };
  const deletePost = (post: NoodlePostCardModel) => {
    setPostMenuId(null);
    options.deletePost(post);
  };

  const ctx: NoodlePostCardCtx = {
    personaAccount: options.personaAccount,
    postManagement: options.postManagement,
    postMenuId,
    setPostMenuId,
    editingPostId,
    editingPostContent,
    setEditingPostContent,
    replyPostId,
    replyParentInteractionId,
    replyText,
    replyHasText,
    setReplyText,
    activeReplyComposerTool,
    setActiveReplyComposerTool,
    highlightedInteractionId: null,
    mediaPickerTab,
    setMediaPickerTab,
    replyComposerRef,
    replyValueRef,
    replyMediaToolRef,
    startEditingPost,
    deleteNoodlePost: deletePost,
    cancelEditingPost,
    saveEditedPost,
    reactToPost: options.reactToPost,
    reactToReply: options.reactToReply,
    openReplyComposer,
    handleReplyChange,
    clearReplyComposer,
    submitReply,
    appendToReply,
    reactionPendingFor: options.reactionPendingFor,
    createInteractionPendingFor: options.createInteractionPendingFor,
    updatePostPending: options.updatePostPending,
    openAuthorProfile: options.openAuthorProfile,
    titleEditing: options.titleMaxLength
      ? {
          editingPostTitle,
          setEditingPostTitle,
          maxLength: options.titleMaxLength,
        }
      : undefined,
  };
  return { ctx, reset };
}

export function NoodlePostCard({
  post,
  ctx,
}: {
  post: NoodlePostCardModel;
  ctx: NoodlePostCardCtx;
}) {
  const {
    personaAccount,
    postMenuId,
    setPostMenuId,
    editingPostId,
    editingPostContent,
    setEditingPostContent,
    replyPostId,
    replyParentInteractionId,
    replyText,
    replyHasText,
    setReplyText,
    activeReplyComposerTool,
    setActiveReplyComposerTool,
    highlightedInteractionId,
    mediaPickerTab,
    setMediaPickerTab,
    replyComposerRef,
    replyValueRef,
    replyMediaToolRef,
    startEditingPost,
    deleteNoodlePost,
    cancelEditingPost,
    saveEditedPost,
    reactToPost,
    reactToReply,
    openReplyComposer,
    handleReplyChange,
    clearReplyComposer,
    submitReply,
    appendToReply,
    reactionPendingFor,
    createInteractionPendingFor,
    updatePostPending,
    titleEditing,
    media,
    replyManagement,
    mentions,
  } = ctx;
  const accountById = ctx.accountById ?? new Map<string, NoodleAccount>();
  const accountByHandle = ctx.accountByHandle ?? new Map<string, NoodleAccount>();
  const authorAccount = accountById.get(post.authorAccountId) ?? null;
  const author = authorAccount ?? post.authorSnapshot;

  // Card-owned defaults for absent capability groups. Hosts pass only the capabilities they
  // support (NoodleR omits media/replyManagement/mentions/poll/profile); the card fills the
  // rest with no-ops and empty state, and gates the corresponding UI on group presence — so
  // no host has to hand over discarded setters, dangling refs, or fake mutations. Annotations
  // keep the () => {} fallbacks callable with their real signatures.
  const fallbackDivRef = useRef<HTMLDivElement | null>(null);
  const fallbackFileRef = useRef<HTMLInputElement | null>(null);
  const openProfile: (account: NoodleAccount | null) => void = ctx.openProfile ?? (() => {});
  const canOpenAuthorProfile = Boolean(authorAccount || ctx.openAuthorProfile);
  const openPostAuthor = () => {
    if (authorAccount) openProfile(authorAccount);
    else ctx.openAuthorProfile?.(post.authorAccountId);
  };
  const handleReplyKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void =
    ctx.handleReplyKeyDown ?? (() => {});
  const voteInPoll: (post: NoodlePostCardModel, optionId: string, selectedOptionId: string | null) => void =
    ctx.voteInPoll ?? (() => {});
  const disableReplyImage = !media;
  const setImageLightbox: React.Dispatch<React.SetStateAction<ChatImage | null>> =
    media?.setImageLightbox ?? (() => {});
  const replyImageUrl = media?.replyImageUrl ?? "";
  const setReplyImageUrl: React.Dispatch<React.SetStateAction<string>> = media?.setReplyImageUrl ?? (() => {});
  const replyImageUrlDraft = media?.replyImageUrlDraft ?? "";
  const setReplyImageUrlDraft: React.Dispatch<React.SetStateAction<string>> =
    media?.setReplyImageUrlDraft ?? (() => {});
  const replyImageToolRef = media?.replyImageToolRef ?? fallbackDivRef;
  const replyImageFileRef = media?.replyImageFileRef ?? fallbackFileRef;
  const applyReplyImageUrl: () => void = media?.applyReplyImageUrl ?? (() => {});
  const uploadGlobalImages = media?.uploadGlobalImages ?? { isPending: false };
  const editingReplyId = replyManagement?.editingReplyId ?? null;
  const editingReplyContent = replyManagement?.editingReplyContent ?? "";
  const setEditingReplyContent: React.Dispatch<React.SetStateAction<string>> =
    replyManagement?.setEditingReplyContent ?? (() => {});
  const startEditingReply: (reply: NoodleInteraction) => void = replyManagement?.startEditingReply ?? (() => {});
  const cancelEditingReply: () => void = replyManagement?.cancelEditingReply ?? (() => {});
  const saveEditedReply: (post: NoodlePostCardModel, reply: NoodleInteraction) => void =
    replyManagement?.saveEditedReply ?? (() => {});
  const deleteNoodleReply: (post: NoodlePostCardModel, reply: NoodleInteraction) => void =
    replyManagement?.deleteNoodleReply ?? (() => {});
  const updateInteraction = replyManagement?.updateInteraction ?? { isPending: false };
  const deleteInteraction = replyManagement?.deleteInteraction ?? { isPending: false };
  const canManageReplyOverride = replyManagement ? replyManagement.canManageReply : () => false;
  const activeReplyMention = mentions?.activeReplyMention ?? null;
  const activeReplyMentionIndex = mentions?.activeReplyMentionIndex ?? 0;
  const replyMentionSuggestions = mentions?.replyMentionSuggestions ?? [];
  const selectReplyMention: (account: NoodleAccount) => void = mentions?.selectReplyMention ?? (() => {});

    const postInteractions = post.interactions;
    const rootPostInteractions = postInteractions.filter((interaction) => !interaction.parentInteractionId);
    const poll = readNoodlePollFromMetadata(post.metadata);
    const pollVotes = poll
      ? rootPostInteractions.filter(
          (interaction) =>
            interaction.type === "vote" && poll.options.some((option) => option.id === interaction.content),
        )
      : [];
    const personaPollVote = personaAccount
      ? (pollVotes.find((interaction) => interaction.actorAccountId === personaAccount.id)?.content ?? null)
      : null;
    const likedByPersona = personaAccount
      ? rootPostInteractions.some(
          (interaction) => interaction.type === "like" && interaction.actorAccountId === personaAccount.id,
        )
      : false;
    const repostedByPersona = personaAccount
      ? rootPostInteractions.some(
          (interaction) => interaction.type === "repost" && interaction.actorAccountId === personaAccount.id,
        )
      : false;
    const replies = postInteractions.filter((interaction) => interaction.type === "reply");
    const replyById = new Map(replies.map((reply) => [reply.id, reply]));
    const orderedReplies: NoodleInteraction[] = [];
    const visitedReplyIds = new Set<string>();
    const appendReplyBranch = (reply: NoodleInteraction) => {
      if (visitedReplyIds.has(reply.id)) return;
      visitedReplyIds.add(reply.id);
      orderedReplies.push(reply);
      for (const child of replies) {
        if (child.parentInteractionId === reply.id) appendReplyBranch(child);
      }
    };
    for (const reply of replies) {
      if (!reply.parentInteractionId || !replyById.has(reply.parentInteractionId)) appendReplyBranch(reply);
    }
    for (const reply of replies) appendReplyBranch(reply);
    const replyTarget = replyParentInteractionId ? (replyById.get(replyParentInteractionId) ?? null) : null;
    const replyTargetActor = replyTarget
      ? (accountById.get(replyTarget.actorAccountId) ?? replyTarget.actorSnapshot)
      : author;
    const postLikePending = reactionPendingFor(post.id, "like");
    const postRepostPending = reactionPendingFor(post.id, "repost");
    const postReplyPending = createInteractionPendingFor(post.id, "reply", replyParentInteractionId);
    const pollVotePending = createInteractionPendingFor(post.id, "vote");
    const renderReplyComposer = (nested: boolean) => (
      <div
        data-component="NoodleView.ReplyComposer"
        data-noodle-reply-parent-id={replyParentInteractionId ?? ""}
        className={cn("border-[var(--noodle-divider)] py-3", nested ? "ml-10 border-b" : "mt-3 border-y")}
      >
        {replyParentInteractionId && replyTargetActor && (
          <p className="mb-2 text-xs text-[var(--muted-foreground)]">
            Replying to <span className="font-semibold text-[var(--noodle-blue)]">@{replyTargetActor.handle}</span>
          </p>
        )}
        <textarea
          ref={replyComposerRef}
          defaultValue={replyText}
          onChange={handleReplyChange}
          onBlur={() => setReplyText(replyValueRef.current)}
          onKeyDown={handleReplyKeyDown}
          className={cn(textareaClass, "min-h-16 resize-none bg-transparent")}
          placeholder="Leave a comment…"
          aria-autocomplete="list"
          aria-controls={activeReplyMention ? "noodle-reply-mention-list" : undefined}
          aria-expanded={Boolean(activeReplyMention)}
          aria-activedescendant={
            activeReplyMention && replyMentionSuggestions.length > 0
              ? `noodle-reply-mention-list-option-${Math.min(
                  activeReplyMentionIndex,
                  replyMentionSuggestions.length - 1,
                )}`
              : undefined
          }
        />
        <NoodleMentionSuggestions
          activeMention={activeReplyMention}
          activeIndex={activeReplyMentionIndex}
          accounts={replyMentionSuggestions}
          listboxId="noodle-reply-mention-list"
          onSelect={selectReplyMention}
        />
        {replyImageUrl && (
          <div className="relative mt-2 overflow-hidden rounded-xl border border-[var(--noodle-divider)]">
            <button
              type="button"
              onClick={() => setImageLightbox(createNoodleLightboxImage(`reply-draft-${post.id}`, replyImageUrl))}
              className="block w-full"
              title="Open attached image"
            >
              <img src={replyImageUrl} alt="Attached reply preview" className="max-h-52 w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => setReplyImageUrl("")}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white [&_svg]:!text-white transition-colors hover:bg-black/80"
              title="Remove image"
              aria-label="Remove reply image"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {!disableReplyImage && (
              <div ref={replyImageToolRef} className="relative">
                <NoodleToolButton
                  title="Attach image"
                  active={activeReplyComposerTool === "image"}
                  onClick={() => setActiveReplyComposerTool((current) => (current === "image" ? null : "image"))}
                >
                  <ImageIcon size={17} />
                </NoodleToolButton>
              </div>
            )}
            <div ref={replyMediaToolRef} className="relative">
              <NoodleToolButton
                title="Emoji, GIFs and stickers"
                active={activeReplyComposerTool === "media"}
                onClick={() => setActiveReplyComposerTool((current) => (current === "media" ? null : "media"))}
              >
                <Smile size={17} />
              </NoodleToolButton>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearReplyComposer}
              className="h-8 rounded-full px-3 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-8 rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={(!replyHasText && !replyImageUrl.trim()) || postReplyPending}
              onClick={() => submitReply(post)}
            >
              {postReplyPending ? "Replying…" : "Reply"}
            </button>
          </div>
        </div>
        {!disableReplyImage && activeReplyComposerTool === "image" && (
          <NoodleToolPopover
            title="Attach image"
            anchorRef={replyImageToolRef}
            onClose={() => setActiveReplyComposerTool(null)}
            wide
          >
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => replyImageFileRef.current?.click()}
                disabled={uploadGlobalImages.isPending}
                className="h-9 w-full rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadGlobalImages.isPending ? "Uploading..." : "Upload From Device"}
              </button>
              <div
                data-component="NoodleView.ReplyImageDivider"
                className="flex items-center gap-2 text-[0.625rem] font-semibold uppercase tracking-normal text-[var(--noodle-blue)]"
              >
                <span className="h-px flex-1 bg-[var(--noodle-divider)]" />
                or
                <span className="h-px flex-1 bg-[var(--noodle-divider)]" />
              </div>
              <label className="block space-y-1.5">
                <span className={labelClass}>Image URL</span>
                <input
                  value={replyImageUrlDraft}
                  onChange={(event) => setReplyImageUrlDraft(event.target.value)}
                  placeholder="https://..."
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                onClick={applyReplyImageUrl}
                className="h-9 w-full rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-bold text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10"
              >
                Attach URL
              </button>
            </div>
          </NoodleToolPopover>
        )}
        {activeReplyComposerTool === "media" && (
          <NoodleAnchoredPopover anchorRef={replyMediaToolRef} wide>
            <ConversationMediaPickerPanel
              tabs={disableReplyImage ? NOODLE_TEXT_MEDIA_PICKER_TABS : NOODLE_MEDIA_PICKER_TABS}
              activeTab={mediaPickerTab}
              onActiveTabChange={setMediaPickerTab}
              onClose={() => setActiveReplyComposerTool(null)}
              onEmojiSelect={appendToReply}
              onGifSelect={(gifUrl) => {
                setReplyImageUrl(gifUrl);
                setActiveReplyComposerTool(null);
              }}
              onStickerSelect={(name) => {
                appendToReply(`sticker:${name}:`);
                setActiveReplyComposerTool(null);
              }}
              className="w-full !border-[var(--marinara-chat-chrome-panel-border)] !bg-[var(--background)] !text-[var(--foreground)] shadow-2xl shadow-black/35"
            />
          </NoodleAnchoredPopover>
        )}
      </div>
    );
    return (
      <article
        key={post.id}
        data-noodle-post-id={post.id}
        tabIndex={-1}
        className="border-b border-[var(--noodle-divider)] px-4 py-4 transition-colors hover:bg-[var(--accent)]/35"
      >
        <div className="flex gap-3">
          {author ? (
            <button
              type="button"
              onClick={openPostAuthor}
              disabled={!canOpenAuthorProfile}
              className="h-fit rounded-full text-left transition-opacity enabled:hover:opacity-80 disabled:cursor-default"
              title={canOpenAuthorProfile ? `View @${author.handle}` : undefined}
            >
              <Avatar account={author} />
            </button>
          ) : (
            <AtSign size={28} className="text-[var(--noodle-blue)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  onClick={openPostAuthor}
                  disabled={!canOpenAuthorProfile}
                  className="font-semibold transition-colors enabled:hover:text-[var(--noodle-blue)] disabled:cursor-default"
                >
                  {author?.displayName ?? "Noodle User"}
                </button>
                <span className="text-xs text-[var(--muted-foreground)]">@{author?.handle ?? "noodle"}</span>
                <span className="text-xs text-[var(--muted-foreground)]">{formatTime(post.createdAt)}</span>
              </div>
              {ctx.postManagement && <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPostMenuId((current) => (current === post.id ? null : post.id))}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10"
                  title="Post actions"
                  aria-label="Post actions"
                >
                  <MoreHorizontal size={18} />
                </button>
                {postMenuId === post.id && (
                  <div className="absolute right-0 top-[calc(100%+0.25rem)] z-30 min-w-32 overflow-hidden rounded-lg border border-[var(--noodle-divider)] bg-[var(--background)] py-1 text-xs shadow-2xl shadow-black/30">
                    <button
                      type="button"
                      onClick={() => startEditingPost(post)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--accent)]"
                    >
                      <Pencil size={14} className="text-[var(--noodle-blue)]" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteNoodlePost(post)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--accent)]"
                    >
                      <Trash2 size={14} className="text-[var(--noodle-blue)]" />
                      Delete
                    </button>
                  </div>
                )}
              </div>}
            </div>
            {ctx.postManagement && editingPostId === post.id ? (
              <div className="mt-2 space-y-2">
                {titleEditing && (
                  <label className="block space-y-1">
                    <span className={labelClass}>Title (optional)</span>
                    <input
                      value={titleEditing.editingPostTitle}
                      onChange={(event) => titleEditing.setEditingPostTitle(event.target.value)}
                      maxLength={titleEditing.maxLength}
                      className={fieldClass}
                      placeholder="Post title"
                    />
                  </label>
                )}
                <textarea
                  value={editingPostContent}
                  onChange={(event) => setEditingPostContent(event.target.value)}
                  className={cn(textareaClass, "min-h-28")}
                  placeholder="Edit post"
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEditingPost}
                    className="h-8 rounded-full border border-[var(--noodle-divider)] px-4 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--accent)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEditedPost(post)}
                    disabled={!editingPostContent.trim() || updatePostPending}
                    className="h-8 rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatePostPending ? "Saving" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {post.title && <h3 className="mt-2 break-words text-base font-bold leading-6">{post.title}</h3>}
                {!poll || post.content.trim() !== poll.question ? (
                  <NoodleTextContent
                    content={post.content}
                    accountByHandle={accountByHandle}
                    onOpenProfile={openProfile}
                    className={cn("leading-6", post.title ? "mt-1" : "mt-2")}
                  />
                ) : null}
              </>
            )}
            {poll && (
              <NoodlePollCard
                poll={poll}
                votes={pollVotes}
                accountById={accountById}
                selectedOptionId={personaPollVote}
                disabled={!personaAccount}
                pending={pollVotePending}
                onVote={(optionId) => voteInPoll(post, optionId, personaPollVote)}
                onOpenProfile={openProfile}
              />
            )}
            {post.imageUrl ? (
              <button
                type="button"
                onClick={() =>
                  setImageLightbox(createNoodleLightboxImage(post.id, post.imageUrl!, post.imagePrompt ?? ""))
                }
                className="mt-3 block w-full overflow-hidden rounded-xl text-left ring-offset-[var(--background)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)] focus-visible:ring-offset-2"
                title="Open image"
                aria-label="Open post image"
              >
                <img
                  src={post.imageUrl}
                  alt={`Image posted by ${author?.displayName ?? "Noodle user"}`}
                  className="max-h-96 w-full object-cover"
                />
              </button>
            ) : post.imagePrompt ? (
              <div className="mt-3 rounded-xl border border-[var(--noodle-blue)]/35 bg-[var(--noodle-blue)]/10 p-3 text-xs leading-5">
                <span className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--noodle-blue)]">
                  <ImageIcon size={13} />
                  Image prompt
                </span>
                {post.imagePrompt}
              </div>
            ) : null}

            <div className="mt-3 flex max-w-md items-center justify-between gap-1">
              <button
                type="button"
                className={cn(noodleIconButtonClass, "rounded-full", likedByPersona && "bg-[var(--noodle-blue)]/10")}
                disabled={!personaAccount || postLikePending}
                onClick={() => reactToPost(post, "like", likedByPersona)}
                title={likedByPersona ? "Unlike" : "Like"}
                aria-label={`${likedByPersona ? "Unlike" : "Like"} post`}
                aria-busy={postLikePending}
                data-noodle-reaction="like"
              >
                <Heart
                  size={18}
                  fill={likedByPersona ? "currentColor" : "none"}
                  strokeWidth={likedByPersona ? 2.4 : 2}
                  className={cn(
                    "transition-[fill,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    likedByPersona && "scale-110",
                  )}
                />
                {countInteractions(rootPostInteractions, "like")}
              </button>
              <button
                type="button"
                className={cn(noodleIconButtonClass, "rounded-full", repostedByPersona && "bg-[var(--noodle-blue)]/10")}
                disabled={!personaAccount || postRepostPending}
                onClick={() => reactToPost(post, "repost", repostedByPersona)}
                title={repostedByPersona ? "Undo repost" : "Repost"}
                aria-busy={postRepostPending}
                data-noodle-reaction="repost"
              >
                <Repeat2 size={24} strokeWidth={1.55} className="-my-1" />
                {countInteractions(rootPostInteractions, "repost")}
              </button>
              <button
                type="button"
                className={cn(noodleIconButtonClass, "rounded-full hover:text-[var(--noodle-blue)]")}
                disabled={!personaAccount}
                onClick={() => openReplyComposer(post.id)}
                title="Reply"
              >
                <MessageCircle size={18} />
                {replies.length}
              </button>
            </div>

            {replyPostId === post.id && !replyParentInteractionId && renderReplyComposer(false)}

            {replies.length > 0 && (
              <div className="mt-3 border-t border-[var(--noodle-divider)]">
                {orderedReplies.map((reply) => {
                  const actorAccount = accountById.get(reply.actorAccountId) ?? null;
                  const actor = actorAccount ?? reply.actorSnapshot;
                  const parentReply = reply.parentInteractionId
                    ? (replyById.get(reply.parentInteractionId) ?? null)
                    : null;
                  const parentActorAccount = parentReply ? (accountById.get(parentReply.actorAccountId) ?? null) : null;
                  const parentActor = parentActorAccount ?? parentReply?.actorSnapshot ?? null;
                  const replyLikes = postInteractions.filter(
                    (interaction) => interaction.type === "like" && interaction.parentInteractionId === reply.id,
                  );
                  const likedReplyByPersona = personaAccount
                    ? replyLikes.some((interaction) => interaction.actorAccountId === personaAccount.id)
                    : false;
                  const canManageReply = canManageReplyOverride
                    ? canManageReplyOverride(reply)
                    : Boolean(
                        personaAccount &&
                          canManageNoodleReply({
                            actorKind: actorAccount?.kind ?? reply.actorSnapshot?.kind,
                            actorAccountId: reply.actorAccountId,
                            personaAccountId: personaAccount.id,
                          }),
                      );
                  return (
                    <Fragment key={reply.id}>
                      <div
                        data-noodle-interaction-id={reply.id}
                        tabIndex={-1}
                        className={cn(
                          "grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-2 border-b border-[var(--noodle-divider)] bg-transparent py-3 text-xs outline-none transition-shadow duration-300 last:border-b-0",
                          highlightedInteractionId === reply.id &&
                            "rounded-lg ring-1 ring-inset ring-[var(--noodle-blue)]/70",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => openProfile(actorAccount)}
                          disabled={!actorAccount}
                          className="h-8 w-8 shrink-0 rounded-full text-left transition-opacity enabled:hover:opacity-80 disabled:cursor-default"
                          title={actorAccount ? `View @${actorAccount.handle}` : undefined}
                        >
                          <Avatar account={actor ?? { displayName: "Noodle User", avatarUrl: null }} size="sm" />
                        </button>
                        <div className="min-w-0 bg-transparent">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <button
                              type="button"
                              onClick={() => openProfile(actorAccount)}
                              disabled={!actorAccount}
                              className="max-w-full truncate font-semibold transition-colors enabled:hover:text-[var(--noodle-blue)] disabled:cursor-default"
                            >
                              {actor?.displayName ?? "Noodle User"}
                            </button>
                            <span className="truncate text-[var(--muted-foreground)]">
                              @{actor?.handle ?? "noodle"}
                            </span>
                            <span className="text-[var(--muted-foreground)]">· {formatTime(reply.createdAt)}</span>
                          </div>
                          {parentActor && (
                            <p className="mt-0.5 text-[var(--muted-foreground)]">
                              Replying to{" "}
                              {parentActorAccount ? (
                                <button
                                  type="button"
                                  onClick={() => openProfile(parentActorAccount)}
                                  className="font-medium text-[var(--noodle-blue)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)]/70"
                                  aria-label={`View @${parentActorAccount.handle} profile`}
                                >
                                  @{parentActorAccount.handle}
                                </button>
                              ) : (
                                <span className="text-[var(--noodle-blue)]">@{parentActor.handle}</span>
                              )}
                            </p>
                          )}
                          {editingReplyId === reply.id ? (
                            <div className="mt-2 space-y-2" data-component="NoodleView.CommentEditor">
                              <textarea
                                value={editingReplyContent}
                                onChange={(event) => setEditingReplyContent(event.target.value)}
                                className={cn(textareaClass, "min-h-20 resize-y")}
                                placeholder="Edit comment"
                                autoFocus
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEditingReply}
                                  disabled={updateInteraction.isPending}
                                  className="h-8 rounded-full px-3 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEditedReply(post, reply)}
                                  disabled={
                                    (!editingReplyContent.trim() && !reply.imageUrl) || updateInteraction.isPending
                                  }
                                  className="h-8 rounded-full bg-[var(--noodle-blue)] px-4 text-xs font-bold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {updateInteraction.isPending ? "Saving" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : reply.content ? (
                            <NoodleTextContent
                              content={reply.content}
                              accountByHandle={accountByHandle}
                              onOpenProfile={openProfile}
                              className="mt-1 leading-5"
                            />
                          ) : null}
                          {reply.imageUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setImageLightbox(
                                  createNoodleLightboxImage(reply.id, reply.imageUrl!, reply.content ?? ""),
                                )
                              }
                              className="mt-2 block w-full overflow-hidden rounded-xl text-left ring-offset-[var(--background)] transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--noodle-blue)] focus-visible:ring-offset-2"
                              title="Open image"
                              aria-label="Open comment image"
                            >
                              <img
                                src={reply.imageUrl}
                                alt={`Image in ${actor?.displayName ?? "Noodle user"}'s comment`}
                                className="max-h-72 w-full object-cover"
                              />
                            </button>
                          )}
                          <div className="mt-1.5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => reactToReply(post, reply, likedReplyByPersona)}
                              disabled={!personaAccount || reactionPendingFor(post.id, "like", reply.id)}
                              className={cn(
                                "inline-flex h-7 items-center gap-1 rounded-full px-2 font-medium text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50",
                                likedReplyByPersona && "bg-[var(--noodle-blue)]/10",
                              )}
                              title={likedReplyByPersona ? "Unlike comment" : "Like comment"}
                              aria-busy={reactionPendingFor(post.id, "like", reply.id)}
                            >
                              <Heart
                                size={14}
                                fill={likedReplyByPersona ? "currentColor" : "none"}
                                strokeWidth={likedReplyByPersona ? 2.4 : 2}
                                className={cn(
                                  "transition-[fill,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                  likedReplyByPersona && "scale-110",
                                )}
                              />
                              {replyLikes.length > 0 && replyLikes.length}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReplyComposer(post.id, reply.id)}
                              disabled={!personaAccount}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Reply"
                              aria-label="Reply"
                            >
                              <MessageCircle size={14} />
                            </button>
                            {canManageReply && editingReplyId !== reply.id && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEditingReply(reply)}
                                  disabled={updateInteraction.isPending || deleteInteraction.isPending}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Edit comment"
                                  aria-label="Edit comment"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteNoodleReply(post, reply)}
                                  disabled={updateInteraction.isPending || deleteInteraction.isPending}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--noodle-blue)] transition-colors hover:bg-[var(--noodle-blue)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Delete comment"
                                  aria-label="Delete comment"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {replyPostId === post.id && replyParentInteractionId === reply.id && renderReplyComposer(true)}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </article>
    );
}

// Shared composer chrome: avatar gutter, borderless body, divider, and the
// tools-left / action-right toolbar row. Noodle fills it with its post composer;
// NoodleR fills it with the guided-generation composer. Keeps both pixel-aligned.
export function NoodleComposerShell({
  header,
  avatar,
  children,
  tools,
  action,
  popovers,
  footer,
  dataComponent,
}: {
  header?: React.ReactNode;
  avatar: React.ReactNode;
  children: React.ReactNode;
  tools?: React.ReactNode;
  action: React.ReactNode;
  popovers?: React.ReactNode;
  footer?: React.ReactNode;
  dataComponent?: string;
}) {
  return (
    <div className="border-b border-[var(--noodle-divider)] px-4 py-3" data-component={dataComponent}>
      {header && <div className="mb-2">{header}</div>}
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
        {avatar}
        <div className="min-w-0">{children}</div>
      </div>
      <div className="mt-1 h-px w-full bg-[var(--noodle-divider)]" />
      <div className="relative mt-3 flex items-center justify-between gap-2 pl-14">
        <div className="flex min-w-0 flex-wrap items-center gap-1">{tools}</div>
        {action}
        {popovers}
      </div>
      {footer}
    </div>
  );
}
