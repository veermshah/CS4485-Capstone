"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  History,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  PencilLine,
  Plus,
  SendHorizonal,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Zoom to Fountaingrove neighborhood and summarize damage.",
  "Where are the least damaged areas?",
  "Show false positives and false negatives.",
  "List potentially unsafe buildings.",
];

const CHAT_STORAGE_KEY = "firelens-chat-threads-v1";
const SLEEP_NOTICE = "(Our chatbot server might be sleeping, so it might take a minute for your first question.)";
const UID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

type MapFocus = {
  kind: string;
  center: { lng: number; lat: number } | null;
  zoom?: number | null;
  building_ids?: string[];
  label?: string | null;
};

type ChatPanelProps = {
  className?: string;
  selectedBuildingId: string | null;
  onMapFocus: (focus: MapFocus | null) => void;
};

type ChatApiResponse = {
  conversation_id: string;
  response: string;
  map_focus?: MapFocus | null;
  sources?: Array<{ title?: string; url?: string; summary?: string | null }>;
};

type ChatSource = {
  title?: string;
  url?: string;
  summary?: string | null;
};

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  timestamp?: number;
};

type ChatThread = {
  id: string;
  title: string;
  conversationId: string | null;
  turns: ChatTurn[];
  createdAt: number;
  updatedAt: number;
  sleepNoticeShown: boolean;
  lastReferencedUid: string | null;
};

type EditingState = {
  threadId: string;
  index: number;
  text: string;
};

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = /language-/.test(className ?? "");
    return isBlock ? (
      <code className={cn("font-mono text-[0.8em]", className)}>{children}</code>
    ) : (
      <code className={cn("rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.8em]", className)}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-foreground/10 p-2 text-[0.8em] leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 italic text-foreground/80">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
};

const createThread = (seed?: Partial<ChatThread>): ChatThread => {
  const now = Date.now();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `thread-${now}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    title: "New chat",
    conversationId: null,
    turns: [],
    createdAt: now,
    updatedAt: now,
    sleepNoticeShown: false,
    lastReferencedUid: null,
    ...seed,
  };
};

const stripSources = (text: string): string => {
  const marker = "\n\nSources consulted:";
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(0, index) : text;
};

const extractUid = (text: string): string | null => {
  const match = text.match(UID_PATTERN);
  return match ? match[0].toLowerCase() : null;
};

const isMapFollowup = (text: string): boolean => {
  const normalized = text.toLowerCase();
  const action = /\b(show|zoom|focus|center|locate)\b/.test(normalized);
  const target = /\b(map|building|that|it|this)\b/.test(normalized);
  const explicit =
    /\b(show\s+me\s+that\s+building)\b/.test(normalized) ||
    /\b(zoom\s+into\s+that\s+building)\b/.test(normalized) ||
    /\b(show\s+me\s+on\s+the\s+map)\b/.test(normalized);
  return (action && target) || explicit;
};

export function ChatPanel({ className, selectedBuildingId, onMapFocus }: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [isListening, setIsListening] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const speechSeedRef = useRef<string>("");

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  const turns = activeThread?.turns ?? [];
  const showSleepNotice = Boolean(activeThread?.sleepNoticeShown && turns.length > 0 && turns.length <= 2);
  const speechSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) {
        const thread = createThread();
        setThreads([thread]);
        setActiveThreadId(thread.id);
        return;
      }

      const parsed = JSON.parse(raw) as { threads?: ChatThread[]; activeThreadId?: string | null };
      if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
        const normalized = parsed.threads.map((thread) => ({
          ...createThread({ id: thread.id }),
          ...thread,
          sleepNoticeShown: thread.sleepNoticeShown ?? false,
          lastReferencedUid: thread.lastReferencedUid ?? null,
        }));
        const nextActiveId =
          normalized.find((t) => t.id === parsed.activeThreadId)?.id ??
          normalized[0].id ??
          null;
        setThreads(normalized);
        setActiveThreadId(nextActiveId);
      } else {
        const thread = createThread();
        setThreads([thread]);
        setActiveThreadId(thread.id);
      }
    } catch {
      const thread = createThread();
      setThreads([thread]);
      setActiveThreadId(thread.id);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threads.length) return;
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({ threads, activeThreadId }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [threads, activeThreadId]);

  useEffect(() => {
    setEditing(null);
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [turns, isSending]);

  const ensureThreadId = () => {
    const existing = activeThreadIdRef.current;
    if (existing) return existing;
    const thread = createThread();
    setActiveThreadId(thread.id);
    activeThreadIdRef.current = thread.id;
    return thread.id;
  };

  const updateThread = (threadId: string, updater: (thread: ChatThread) => ChatThread) => {
    setThreads((current) => {
      const index = current.findIndex((thread) => thread.id === threadId);
      if (index === -1) {
        const created = updater(createThread({ id: threadId }));
        return [created, ...current];
      }
      const next = [...current];
      next[index] = updater(next[index]);
      return next;
    });
  };

  const handleNewThread = () => {
    const thread = createThread();
    setThreads((current) => [thread, ...current]);
    setActiveThreadId(thread.id);
    setMessage("");
    onMapFocus(null);
  };

  const handleDeleteThread = (threadId: string) => {
    if (!window.confirm("Delete this chat thread? This cannot be undone.")) return;

    setThreads((current) => {
      const next = current.filter((thread) => thread.id !== threadId);
      if (!next.length) {
        const fresh = createThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }

      if (threadId === activeThreadIdRef.current) {
        setActiveThreadId(next[0].id ?? null);
      }

      return next;
    });
  };

  const beginEdit = (index: number) => {
    if (!activeThread) return;
    const target = activeThread.turns[index];
    if (!target || target.role !== "user") return;
    setEditing({ threadId: activeThread.id, index, text: target.text });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = () => {
    if (!editing) return;
    const updatedText = editing.text.trim();
    if (!updatedText) return;

    updateThread(editing.threadId, (thread) => {
      if (!thread.turns[editing.index]) return thread;
      const nextTurns = [...thread.turns];
      nextTurns[editing.index] = {
        ...nextTurns[editing.index],
        text: updatedText,
      };
      return { ...thread, turns: nextTurns, updatedAt: Date.now() };
    });
    setEditing(null);
  };

  const toggleListening = () => {
    if (!speechSupported) return;

    if (isListening) {
      speechRecognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    speechSeedRef.current = message ? `${message.trimEnd()} ` : "";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0]?.transcript ?? "";
      }
      const combined = `${speechSeedRef.current}${transcript}`.trimStart();
      setMessage(combined);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const sendMessage = async (nextMessage: string) => {
    const text = nextMessage.trim();
    if (!text || isSending) return;

    if (isListening) {
      speechRecognitionRef.current?.stop();
    }

    const threadId = ensureThreadId();
    const now = Date.now();

    const explicitUid = extractUid(text);
    updateThread(threadId, (thread) => {
      const nextTurns = [...thread.turns, { role: "user" as const, text, timestamp: now }];
      const showNotice = !thread.sleepNoticeShown;

      const title =
        thread.title === "New chat" && thread.turns.length === 0
          ? text.slice(0, 48)
          : thread.title;

      return {
        ...thread,
        title,
        turns: nextTurns,
        updatedAt: now,
        sleepNoticeShown: thread.sleepNoticeShown || showNotice,
        lastReferencedUid: explicitUid ?? thread.lastReferencedUid,
      };
    });

    setMessage("");
    setIsSending(true);
    setPendingThreadId(threadId);

    try {
      const fallbackUid = isMapFollowup(text) ? activeThread?.lastReferencedUid : null;
      const effectiveBuildingId = selectedBuildingId ?? fallbackUid ?? null;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          building_id: effectiveBuildingId,
          conversation_id: activeThread?.conversationId,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.error ?? `Chat API failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatApiResponse;
      onMapFocus(payload.map_focus ?? null);
      updateThread(threadId, (thread) => ({
        ...thread,
        conversationId: payload.conversation_id || thread.conversationId,
        turns: [
          ...thread.turns,
          {
            role: "assistant",
            text: stripSources(payload.response ?? ""),
            sources: payload.sources ?? [],
            timestamp: Date.now(),
          },
        ],
        updatedAt: Date.now(),
        lastReferencedUid: extractUid(payload.response ?? "") ?? thread.lastReferencedUid,
      }));
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error";
      onMapFocus(null);
      updateThread(threadId, (thread) => ({
        ...thread,
        turns: [
          ...thread.turns,
          { role: "assistant", text: `Error: ${detail}`, timestamp: Date.now() },
        ],
        updatedAt: Date.now(),
      }));
    } finally {
      setIsSending(false);
      setPendingThreadId(null);
    }
  };

  const isEmpty = turns.length === 0;

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0",
        className,
      )}
    >
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 border-b px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Damage Assessment Assistant
        </CardTitle>
        <div className="flex items-center gap-2">
          {selectedBuildingId && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
              uid: {selectedBuildingId.slice(0, 8)}…
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Chat threads">
                <History className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Chat Threads</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {threads.length === 0 ? (
                <DropdownMenuItem disabled>No saved chats</DropdownMenuItem>
              ) : (
                threads.map((thread) => (
                  <DropdownMenuItem
                    key={thread.id}
                    onSelect={() => setActiveThreadId(thread.id)}
                    className={cn(
                      "cursor-pointer",
                      thread.id === activeThreadId && "bg-accent",
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="truncate">{thread.title}</span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleNewThread} className="cursor-pointer">
                <Plus className="h-3.5 w-3.5" />
                New chat
              </DropdownMenuItem>
              {activeThreadId && (
                <DropdownMenuItem
                  onSelect={() => handleDeleteThread(activeThreadId)}
                  className="cursor-pointer"
                  variant="destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete current
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="New chat"
            onClick={handleNewThread}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {isEmpty ? (
            <EmptyState onPick={(prompt) => void sendMessage(prompt)} disabled={isSending} />
          ) : (
            <div className="flex flex-col gap-2.5 py-1">
              {showSleepNotice && <SleepNotice />}
              {turns.map((turn, index) => (
                <MessageBubble
                  key={index}
                  turn={turn}
                  isEditing={editing?.threadId === activeThread?.id && editing?.index === index}
                  editingText={editing?.text ?? ""}
                  onEdit={() => beginEdit(index)}
                  onEditChange={(value) =>
                    setEditing((prev) => (prev ? { ...prev, text: value } : prev))
                  }
                  onEditCancel={cancelEdit}
                  onEditSave={saveEdit}
                />
              ))}
              {isSending && pendingThreadId === activeThreadId && <TypingBubble />}
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(message);
          }}
        >
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={isSending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(message);
              }
            }}
            placeholder={
              selectedBuildingId
                ? "Ask about this building or the dataset…"
                : "Ask about the damage assessment results…"
            }
            rows={1}
            className="min-h-9 max-h-32 resize-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!speechSupported}
            className={cn("h-9 w-9 shrink-0", isListening && "text-red-500")}
            aria-label={isListening ? "Stop dictation" : "Start dictation"}
            onClick={toggleListening}
            title={speechSupported ? "Speech to text" : "Speech recognition not supported"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={isSending || !message.trim()}
            className="h-9 w-9 shrink-0"
            aria-label="Send"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SleepNotice() {
  return (
    <div className="rounded-xl border border-border bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
      {SLEEP_NOTICE}
    </div>
  );
}

function MessageBubble({
  turn,
  isEditing,
  editingText,
  onEdit,
  onEditChange,
  onEditCancel,
  onEditSave,
}: {
  turn: ChatTurn;
  isEditing: boolean;
  editingText: string;
  onEdit: () => void;
  onEditChange: (value: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
}) {
  const isUser = turn.role === "user";
  const hasSources = !isUser && (turn.sources?.length ?? 0) > 0;

  return (
    <div className={cn("flex w-full gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {isUser ? (
          isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editingText}
                onChange={(event) => onEditChange(event.target.value)}
                className="min-h-[90px] text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={onEditCancel}>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={onEditSave}>
                  <Check className="h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <span className="whitespace-pre-wrap">{turn.text}</span>
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Edit
              </button>
            </div>
          )
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {turn.text}
          </ReactMarkdown>
        )}
        {hasSources && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Sources consulted</summary>
            <ul className="mt-1 space-y-1">
              {turn.sources?.map((source, index) => (
                <li key={`${source.url ?? "source"}-${index}`}>
                  {source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      {source.title ?? source.url}
                    </a>
                  ) : (
                    <span>{source.title ?? "Source"}</span>
                  )}
                  {source.summary ? (
                    <span className="block text-[11px] text-muted-foreground/80">
                      {source.summary}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex w-full justify-start gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      </div>
    </div>
  );
}

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-1 py-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Bot className="h-4 w-4 text-primary" />
        How can I help with this run?
      </div>
      <p className="text-xs text-muted-foreground">
        Try one of these, or ask anything about the evaluation results.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SUGGESTIONS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt)}
            className={cn(
              "rounded-full border border-border bg-background px-3 py-1 text-xs transition-colors",
              "hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
              "disabled:opacity-50",
            )}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
