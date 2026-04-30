"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, SendHorizonal, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Where are the largest clusters of severe damage?",
  "Which areas should responders prioritize first?",
  "Show false positives and false negatives.",
  "List potentially unsafe buildings.",
];

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
};

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
};

export function ChatPanel({ className, selectedBuildingId, onMapFocus }: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [turns, isSending]);

  const sendMessage = async (nextMessage: string) => {
    const text = nextMessage.trim();
    if (!text || isSending) return;

    setTurns((prev) => [...prev, { role: "user", text }]);
    setMessage("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          building_id: selectedBuildingId,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail?.error ?? `Chat API failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatApiResponse;
      setConversationId(payload.conversation_id);
      onMapFocus(payload.map_focus ?? null);
      setTurns((prev) => [...prev, { role: "assistant", text: payload.response }]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error";
      onMapFocus(null);
      setTurns((prev) => [...prev, { role: "assistant", text: `Error: ${detail}` }]);
    } finally {
      setIsSending(false);
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
        {selectedBuildingId && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
            uid: {selectedBuildingId.slice(0, 8)}…
          </span>
        )}
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
              {turns.map((turn, index) => (
                <MessageBubble key={index} turn={turn} />
              ))}
              {isSending && <TypingBubble />}
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
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={isSending}
            placeholder={
              selectedBuildingId
                ? "Ask about this building or the dataset…"
                : "Ask about the damage assessment results…"
            }
            className="h-9"
          />
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

function MessageBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";

  return (
    <div className={cn("flex w-full gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        {turn.text}
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
