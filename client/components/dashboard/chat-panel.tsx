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

export function ChatPanel({ className }: { className?: string }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([
    "Assistant: Welcome. Ask about wildfire damage trends and building-level evidence.",
    "You: Which area has the highest destruction density?",
    "Assistant: Sector NW-4 has the highest destroyed-building concentration.",
  ]);

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
            <Badge key={prompt} variant="secondary" className="cursor-pointer px-3 py-1">
              {prompt}
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about this wildfire run..."
          />
          <Button
            onClick={() => {
              if (!message.trim()) return;
              setMessages((prev) => [...prev, `You: ${message.trim()}`]);
              setMessage("");
            }}
          >
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
