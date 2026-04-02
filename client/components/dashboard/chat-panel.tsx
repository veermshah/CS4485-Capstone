"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const prompts = [
  "Summarize high-risk wildfire zones",
  "Which buildings have low confidence labels?",
  "Compare this run with previous run",
];

type ChatPanelProps = {
  className?: string;
  selectedBuildingId: string | null;
};

type ChatApiResponse = {
  conversation_id: string;
  response: string;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export function ChatPanel({ className, selectedBuildingId }: ChatPanelProps) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<string[]>([
    "Assistant: Select a building, then ask about damage evidence and risk.",
  ]);

  const sendMessage = async (nextMessage: string) => {
    const text = nextMessage.trim();
    if (!text || !selectedBuildingId || isSending) return;

    setMessages((prev) => [...prev, `You: ${text}`]);
    setMessage("");
    setIsSending(true);

    try {
      const response = await fetch(`${BACKEND_URL}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          building_id: selectedBuildingId,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API failed (${response.status})`);
      }

      const payload = (await response.json()) as ChatApiResponse;
      setConversationId(payload.conversation_id);
      setMessages((prev) => [...prev, `Assistant: ${payload.response}`]);
    } catch {
      setMessages((prev) => [
        ...prev,
        "Assistant: I could not reach the backend chat service. Check backend server and URL.",
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>

      <CardContent className="flex h-[calc(100%-56px)] flex-col gap-3">
        <ScrollArea className="flex-1 pr-1">
          <div className="space-y-3 py-1">
            {messages.map((item, index) => (
              <div key={`${item}-${index}`} className="rounded-md bg-muted p-3 text-sm">
                {item}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Badge
              key={prompt}
              variant="secondary"
              className="cursor-pointer px-3 py-1"
              onClick={() => {
                if (!selectedBuildingId) return;
                void sendMessage(prompt);
              }}
            >
              {prompt}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!selectedBuildingId || isSending}
            placeholder="Ask about this wildfire run..."
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendMessage(message);
              }
            }}
          />
          <Button
            disabled={!selectedBuildingId || isSending || !message.trim()}
            onClick={() => {
              void sendMessage(message);
            }}
          >
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
        {!selectedBuildingId && (
          <p className="text-xs text-muted-foreground">
            Select a building on the map or in the list to start contextual chat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
