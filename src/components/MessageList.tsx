import { technicalGroups, producedFiles, localFileReference } from "../../shared/conversation-view.mjs";
import { FileText } from "lucide-react";
import { ImageViewer } from "./ImageViewer";
import {
  Fragment,
  memo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {PlanSteps} from './PlanSteps';
import {normalizePlanEntries} from '../../shared/activity-status.mjs';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  matchSlashCommand,
  parseSlashInvocation,
  type SlashCommand,
} from "../lib/commands";
import {
  formatClock,
  formatDayLabel,
  formatFullTimestamp,
  sameCalendarDay,
} from "../lib/time";
import type { PermissionRequest, TimelineItem } from "../types/desktop";
import {extractToolCallId} from "../../shared/permission-options.mjs";
import { displayUserMessageText, formatOptionLabel } from "../lib/timeline";
import {
  classifyOptionId,
  permissionButtonClass,
} from "../../shared/permission-options.mjs";
import { usePrivacy } from "../lib/privacy-context";
import { looksLikePlanQuestion } from "../../shared/session-mode.mjs";
import { thoughtPreview } from "../../shared/thought-preview.mjs";
import { buildToolCard, ToolCardView } from "./ToolCardView";
import {
  applyFormattedCopy,
  copyMarkdownRich,
  installCopySelectionMarkdownHook,
  writeRichClipboard,
} from "../lib/copy-formatted";

/** Stable empties so default props do not bust React.memo every parent render. */
const EMPTY_COMMANDS: SlashCommand[] = [];
const EMPTY_PERMISSIONS: PermissionRequest[] = [];

/** Hoisted so ReactMarkdown is not handed new plugin/component identities per render. */
const REMARK_PLUGINS = [remarkGfm];

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && /^https?:\/\//i.test(href)) {
          void window.grokDesktop.openExternal(href);
        } else if(href) document.dispatchEvent(new CustomEvent('grok:open-file-reference',{detail:href}));
      }}
    >
      {children}
    </a>
  );
}

/** Only allow http(s) remote images; block data:/file: model-driven egress. */
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  if (!src || !/^https?:\/\//i.test(src)) {
    return (
      <span className="md-img-blocked" title={src || ""}>
        [{alt || "image blocked"}]
      </span>
    );
  }
  return <img src={src} alt={alt || ""} loading="lazy" />;
}

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="md-codeblock">
      <button
        type="button"
        className="btn ghost btn-sm md-code-copy"
        title="Copy code"
        aria-label="Copy code"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const text = (preRef.current?.textContent || "").replace(/\n$/, "");
          if (!text) return;
          void writeRichClipboard({ text })
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

const MD_COMPONENTS = {
  a: MarkdownLink,
  img: MarkdownImage,
  pre: MarkdownCodeBlock,
};

function MsgMeta({
  role,
  at,
  actions,
}: {
  role: string;
  at?: number;
  actions?: ReactNode;
}) {
  const clock = formatClock(at);
  return (
    <div className="meta">
      <span className="meta-role">{role}</span>
      <div className="meta-end">
        {clock ? (
          <time
            className="meta-time"
            dateTime={at ? new Date(at).toISOString() : undefined}
            title={formatFullTimestamp(at)}
          >
            {clock}
          </time>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function CopyReplyButton({
  markdown,
  ariaLabel = "Copy reply with formatting",
  plain = false,
}: {
  markdown: string;
  ariaLabel?: string;
  /** Skip GFM HTML so Slack/Docs do not restyle *stars* or foo_bar. */
  plain?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const text = markdown.trim();
  if (!text) return null;

  return (
    <button
      type="button"
      className="btn ghost btn-sm msg-copy"
      title={
        plain
          ? "Copy prompt as plain text"
          : "Copy with formatting for Slack, Docs, and Teams. Shift+click copies Markdown."
      }
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyMarkdownRich(text, {
          markdownOnly: plain || e.shiftKey,
        })
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function DayDivider({ at }: { at: number }) {
  const label = formatDayLabel(at);
  if (!label) return null;
  return (
    <div className="day-divider" role="separator">
      <span>{label}</span>
    </div>
  );
}

function sourceBadgeLabel(cmd?: SlashCommand): string {
  if (!cmd) return "slash";
  if (cmd.local || cmd.source === "desktop") return "app";
  if (cmd.source === "skill") return "skill";
  return "command";
}


/**
 * Thinking stays a one-line trace while Hide thinking is on. Full cards
 * stacked over the thread and made the feed unusable (issue #2). Click to
 * read one block; that body scrolls inside a cap. Untick Hide thinking to
 * show every block in the transcript scroll.
 */
function ThoughtBlock({
  item,
  live,
  day,
  hideThinking,
}: {
  item: Extract<TimelineItem, { kind: "thought" }>;
  live: boolean;
  day: ReactNode;
  hideThinking: boolean;
}) {
  const { redact } = usePrivacy();
  /** null follows the checkbox. A click pins this block open or shut. */
  const [pinnedOpen, setPinnedOpen] = useState<boolean | null>(null);
  useEffect(() => {
    setPinnedOpen(null);
  }, [hideThinking]);
  const open = pinnedOpen ?? !hideThinking;
  const revealed = open && !hideThinking;
  const text = redact(item.text || "");
  const preview = thoughtPreview(text);
  const bodyId = `${item.id}-thought`;
  const clock = formatClock(item.at);

  return (
    <Fragment>
      {day}
      <article
        className={`msg thought${open ? " is-open" : " is-folded"}${revealed ? " is-revealed" : ""}${live ? " is-live" : ""}`}
      >
        <button
          type="button"
          className="thought-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setPinnedOpen(!open)}
        >
          <span className="thought-chevron" aria-hidden="true" />
          <span className="thought-label">{live ? "Thinking" : "Thought"}</span>
          {open && hideThinking ? (
            <span className="thought-preview thought-preview--hint">Hide</span>
          ) : open ? null : preview ? (
            <span className="thought-preview">{preview}</span>
          ) : (
            <span className="thought-preview thought-preview--hint">
              {live ? "…" : "Empty"}
            </span>
          )}
          {clock ? (
            <time
              className="meta-time"
              dateTime={new Date(item.at).toISOString()}
              title={formatFullTimestamp(item.at)}
            >
              {clock}
            </time>
          ) : null}
        </button>
        {open ? (
          <div id={bodyId} className="body thought-body">
            {text}
          </div>
        ) : null}
      </article>
    </Fragment>
  );
}

/**
 * One timeline row. Memoized so streaming / typing only re-renders rows whose
 * props actually changed (assistant markdown is the expensive case).
 * Relies on applySessionUpdate preserving object identity for unchanged items.
 */
const TimelineRow = memo(function TimelineRow({
  item,
  showDay,
  knownCommands,
  planQuestion = false,
  liveThought = false,
  hideThinking = true,
}: {
  item: TimelineItem;
  showDay: boolean;
  knownCommands: SlashCommand[];
  planQuestion?: boolean;
  /** Tail thought while a turn is running. Folded either way; this only labels it. */
  liveThought?: boolean;
  hideThinking?: boolean;
}) {
  const { redact } = usePrivacy();
  const [image,setImage]=useState<string|null>(null);
  const day =
    showDay && typeof item.at === "number" ? (
      <DayDivider at={item.at} />
    ) : null;

  if (item.kind === "user") {
    const text = displayUserMessageText(item.text || "");
    const displayText = redact(text);
    const inv = parseSlashInvocation(text);
    const isCmd = Boolean(inv);
    const matched = inv
      ? matchSlashCommand(inv.name, knownCommands)
      : undefined;
    const badge = sourceBadgeLabel(matched);
    const restLines =
      inv && displayText.includes("\n")
        ? displayText.slice(displayText.indexOf("\n") + 1)
        : "";

    return (
      <Fragment>
        {day}
        <article
          className={`msg user${isCmd ? " user-command" : ""}${item.queued ? " queued" : ""}`}
        >
          <MsgMeta
            role={
              item.queued
                ? "You · waiting"
                : isCmd
                  ? "You · command"
                  : "You"
            }
            at={item.at}
            actions={
              <><button type="button" className="btn ghost btn-sm msg-reuse" onClick={()=>document.dispatchEvent(new CustomEvent('grok:reuse-prompt',{detail:text}))}>Use as new prompt</button><CopyReplyButton
                markdown={displayText}
                ariaLabel="Copy prompt"
                plain
              /></>
            }
          />
          {item.images && item.images.length > 0 && (
            <div className="msg-images">
              {item.images.map((img, j) => (
                <button
                  key={j}
                  type="button"
                  className="msg-image"
                  title="Image attachment"
                  onClick={() => setImage(img.previewUrl)}
                >
                  <img src={img.previewUrl} alt={`Attachment ${j + 1}`} />
                </button>
              ))}
            </div>
          )}
          {image&&<ImageViewer src={image} alt="Image attachment" onClose={()=>setImage(null)}/>}
          {displayText ? (
            inv ? (
              <div className="body body-command">
                <div
                  className={`cmd-invocation ${matched ? "cmd-known" : "cmd-unknown"}`}
                  title={
                    matched
                      ? `${matched.description}${matched.local ? " (handled in app)" : " (sent to agent)"}`
                      : "Looks like a slash command — agent will interpret it"
                  }
                >
                  <span className={`cmd-badge ${badge}`}>{badge}</span>
                  <code className="cmd-name">/{inv.name}</code>
                  {matched ? (
                    <span className="cmd-picked">
                      {matched.local ? "app command" : "skill / command"}
                    </span>
                  ) : (
                    <span className="cmd-picked cmd-picked-soft">slash</span>
                  )}
                </div>
                {inv.args ? (
                  <div className="cmd-args">{redact(inv.args)}</div>
                ) : null}
                {restLines ? <div className="cmd-rest">{restLines}</div> : null}
              </div>
            ) : (
              <div className="body">{displayText}</div>
            )
          ) : null}
        </article>
      </Fragment>
    );
  }

  if (item.kind === "assistant") {
    const display = redact(item.text);
    return (
      <Fragment>
        {day}
        <article className={planQuestion ? "msg ask-user-question" : "msg"}>
          <MsgMeta
            role="Grok"
            at={item.at}
            actions={<CopyReplyButton markdown={display} />}
          />
          <div className="body markdown">
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              components={MD_COMPONENTS}
              urlTransform={(url,key)=>key==='href'&&localFileReference(url,'C:/')?url:/^https?:/i.test(url)?url:''}
            >
              {display}
            </ReactMarkdown>
          </div>
        </article>
      </Fragment>
    );
  }

  if (item.kind === "thought") {
    return (
      <ThoughtBlock
        item={item}
        live={liveThought}
        day={day}
        hideThinking={hideThinking}
      />
    );
  }

  if (item.kind === "tool") {
    const card = buildToolCard({
      title: item.title,
      raw: item.raw,
      content: item.content,
    });
    return (
      <Fragment>
        {day}
        <details className={item.askUser ? "msg tool ask-user-question" : "msg tool"}>
          <summary>{card.heading || card.action || "Tool activity"}<span className={`tool-status ${item.status}`}>{item.status}</span>{item.endedAt&&item.endedAt>=item.at&&<span className="tool-duration">{((item.endedAt-item.at)/1000).toFixed(1)}s</span>}</summary>
          <MsgMeta role="Tool" at={item.at} />
          <div className="tool-body">
            <div className="tool-header">
              <div className="tool-title-wrap">
                <ToolCardView card={card} />
              </div>
              <span className={`tool-status ${item.status}`}>{item.status}</span>
            </div>
            {card.output ? (
              <pre className="tool-output" title="Output">
                {redact(card.output)}
              </pre>
            ) : null}
          </div>
        </details>
      </Fragment>
    );
  }

  if (item.kind === "plan") {
    const entries = item.entries || [];
    return (
      <Fragment>
        {day}
        <article className="msg plan">
          <MsgMeta role="Plan" at={item.at} />
          <div className="body">
            <PlanSteps entries={normalizePlanEntries(entries)} label="Response plan"/>
          </div>
        </article>
      </Fragment>
    );
  }

  return (
    <Fragment>
      {day}
      <article className="msg">
        <MsgMeta role="System" at={item.at} />
        <div className="body">{redact(item.text || "")}</div>
      </article>
    </Fragment>
  );
});

function PendingApprovalCard({
  request,
  onPermission,
}: {
  request: PermissionRequest;
  onPermission?: (reqId: string, optionId: string | "cancelled") => void;
}) {
  const tool = request.params?.toolCall;
  const options = request.params?.options?.length
    ? request.params.options
    : [
        { optionId: "allow-once", name: "Allow once" },
        { optionId: "reject", name: "Reject" },
      ];
  const card = buildToolCard({
    title: tool?.title,
    kind: tool?.kind,
    raw: tool?.rawInput,
  });

  return (
    <article
      className="msg pending-approval"
      role="status"
      aria-live="polite"
    >
      <div className="meta">
        <span className="meta-role">Approval</span>
        <span className="pending-approval-pill">Waiting</span>
      </div>
      <div className="body pending-approval-body">
        <div className="pending-approval-title">
          Waiting for tool approval…
        </div>
        <ToolCardView card={card} />
        {onPermission ? (
          <div className="perm-actions">
            {options.map((opt) => {
              const cls = classifyOptionId(opt.optionId, options);
              return (
                <button
                  key={opt.optionId}
                  type="button"
                  className={permissionButtonClass(cls)}
                  onClick={() => onPermission(request.reqId, opt.optionId)}
                >
                  {formatOptionLabel(opt.optionId, opt.name)}
                </button>
              );
            })}
            <button
              type="button"
              className="btn danger"
              onClick={() => onPermission(request.reqId, "cancelled")}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="pending-approval-hint">Waiting for approval…</div>
        )}
      </div>
    </article>
  );
}

function lastPlanQuestionId(items: TimelineItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "thought" || item.kind === "system") continue;
    if (item.kind === "assistant" && looksLikePlanQuestion(item.text)) {
      return item.id;
    }
    return null;
  }
  return null;
}

export const MessageList = memo(function MessageList({
  items,
  bottomRef,
  scrollerRef,
  knownCommands,
  planMode = false,
  streaming = false,
  hideThinking = true,
  pendingPermissions,
  onPermission,
  onAllowAllPermissions,
  tailContent,
}: {
  items: TimelineItem[];
  bottomRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** Skills + agent + desktop commands for slash recognition in user bubbles */
  knownCommands?: SlashCommand[];
  planMode?: boolean;
  /** True while a turn is running, so the tail thought can read as live. */
  streaming?: boolean;
  /** Fold thinking blocks. Untick in the topbar to show them in the scroll. */
  hideThinking?: boolean;
  /** Open session/request_permission gates (renderer-only; not from ACP timeline) */
  pendingPermissions?: PermissionRequest[];
  onPermission?: (reqId: string, optionId: string | "cancelled") => void;
  /** Batch-approve every open request (multi-edit batches) */
  onAllowAllPermissions?: () => void;
  tailContent?: ReactNode;
}) {
  const cmds = knownCommands ?? EMPTY_COMMANDS;
  const perms = pendingPermissions ?? EMPTY_PERMISSIONS;
  const questionId = planMode ? lastPlanQuestionId(items) : null;
  const tail = items[items.length - 1];
  const liveThoughtId =
    streaming && tail?.kind === "thought" ? tail.id : null;

  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      applyFormattedCopy(e);
    };
    document.addEventListener("copy", onCopy);
    const unhook = installCopySelectionMarkdownHook();
    return () => {
      document.removeEventListener("copy", onCopy);
      unhook();
    };
  }, []);

  const emptyWelcome = items.length === 0 && perms.length === 0;

  return (
    <div className="timeline" ref={scrollerRef}>
      {emptyWelcome ? (
        <div className="empty-state">
          <h2>What can I help with?</h2>
          <p>
            Ask a question, work on files, or troubleshoot your computer.
          </p>
        </div>
      ) : (
        <>
          {technicalGroups(items).map(group=>{
            const render=(item:TimelineItem)=>{
              const index=items.indexOf(item),prev=items[index-1];
              return <div className="history-item" key={item.id} data-history-ordinal={item.historyOrdinal}><TimelineRow item={item} showDay={!prev||!sameCalendarDay(prev.at,item.at)} knownCommands={cmds} planQuestion={item.id===questionId} liveThought={item.id===liveThoughtId} hideThinking={hideThinking}/>{item.kind==='tool'&&perms.filter(p=>extractToolCallId(p.params)===item.toolCallId).map(p=><PendingApprovalCard key={p.reqId} request={p} onPermission={onPermission}/>)}</div>;
            };
            if(group.kind==='work') {
              const running=group.items.some(item=>item.kind==='tool'&&!['completed','failed','cancelled'].includes(item.status)),failed=group.items.some(item=>item.kind==='tool'&&['failed','cancelled'].includes(item.status));
              return <details className="work-summary" key={group.id} open={running||failed||!hideThinking||undefined}><summary><span className={`work-dot ${failed?'failed':running?'running':''}`}/><span>{failed?'Work needs attention':running?'Working through the task':`Worked through ${group.items.length} step${group.items.length===1?'':'s'}`}</span><small>{group.items.filter(item=>item.kind==='tool').length} tool{group.items.filter(item=>item.kind==='tool').length===1?'':'s'}</small></summary>{group.items.map(render)}</details>;
            }
            const item=group.items[0],files=producedFiles(items,items.indexOf(item));
            return <Fragment key={item.id}>{render(item)}{files.length>0&&<div className="response-files"><span>Files from this response</span><div>{files.map(path=><button key={path} title={path} onClick={()=>document.dispatchEvent(new CustomEvent('grok:open-file-reference',{detail:path}))}><FileText size={14}/>{path.split(/[\\/]/).pop()}</button>)}</div></div>}</Fragment>;
          })}
          {perms.length > 1 && onAllowAllPermissions ? (
            <div className="perm-batch-inline" role="region" aria-label="Batch approvals">
              <p className="perm-batch-hint">
                {perms.length} tools waiting — Allow all grants each once so
                multi-edit batches do not stall.
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={() => onAllowAllPermissions()}
              >
                Allow all ({perms.length})
              </button>
            </div>
          ) : null}
          {perms.filter(p=>!items.some(item=>item.kind==='tool'&&item.toolCallId===extractToolCallId(p.params))).map((p) => (
            <PendingApprovalCard
              key={p.reqId}
              request={p}
              onPermission={onPermission}
            />
          ))}
        </>
      )}
      {tailContent}
      <div ref={bottomRef} />
    </div>
  );
});
