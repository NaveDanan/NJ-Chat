"use client";

import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clipboard, RefreshCw, Edit3, ChevronDown } from "lucide-react";
import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string; id?: string; model?: string; usage?: any; latencyMs?: number; thinking?: string; thinkingTime?: number };

type Props = {
  m: Message;
  onRegenerate?: (m: Message) => void;
  onEdit?: (m: Message) => void;
  isStreaming?: boolean;
};

function ThinkingSection({ thinking, thinkingTime }: { thinking: string; thinkingTime?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="font-ui-serif mb-3 rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-gray-100/50 dark:hover:bg-gray-700/30 rounded-lg transition-colors"
      >
        <ChevronDown 
          className={`h-4 w-4 text-gray-500 transition-transform ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`} 
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {thinkingTime ? `Thought for ${thinkingTime.toFixed(2)} seconds` : 'Thinking...'}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700">
          <div className="font-ui-serif text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-48 overflow-y-auto pt-2">
            {thinking}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessageItem({ m, onRegenerate, onEdit, isStreaming = false }: Props) {
  const isUser = m.role === "user";
  const showLoadingIndicator = !isUser && isStreaming;
  const bubbleClasses = cn(
    "min-w-0 flex-1 max-w-full rounded-2xl border p-3 shadow-sm sm:max-w-[85%] relative",
    isUser ? "bg-secondary/50 border-border pt-6 pr-16" : "bg-card border-border",
    showLoadingIndicator ? "pr-12" : ""
  );

  return (
    <div className={`mx-auto flex w-full max-w-3xl gap-3 ${isUser ? "flex-row-reverse justify-end" : "justify-start"}`}>
      <div className={`mt-1 flex h-8 w-8 select-none items-center justify-center rounded-full border text-xs ${isUser ? "bg-primary text-primary-foreground border-transparent" : "bg-secondary text-foreground border-border"}`}>
        {isUser ? "U" : "A"}
      </div>
      <div className={bubbleClasses}>
        {isUser && (
          <div className="absolute right-3 top-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-3"
              onClick={() => onEdit?.(m)}
              title="Edit"
              aria-label="Edit message"
            >
              <Edit3 className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        )}
        {showLoadingIndicator && (
          <div className="absolute right-3 top-3">
            <img
              src="/images/loading.gif"
              alt="Loading..."
              className="h-5 w-5 opacity-70"
              title="AI is responding..."
            />
          </div>
        )}
        {/* Thinking section for assistant messages */}
        {!isUser && (m as any).thinking && (
          <ThinkingSection 
            thinking={(m as any).thinking} 
            thinkingTime={(m as any).thinkingTime}
          />
        )}
        
        {isUser ? (
          <div className="font-ui-serif whitespace-pre-wrap text-[15px] leading-7">{m.content}</div>
        ) : (
          <Markdown content={m.content} />
        )}
        <div className="message-meta mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {m.role === "assistant" && m.model && <span>{m.model}</span>}
          {m.role === "assistant" && m.usage && (m.usage.total_tokens || m.usage.completion_tokens || m.usage.prompt_tokens) && (
            <span>
              tokens: {m.usage.total_tokens ?? "?"} ({m.usage.prompt_tokens ?? "?"}+{m.usage.completion_tokens ?? "?"})
            </span>
          )}
          {m.role === "assistant" && typeof m.latencyMs === "number" && <span>{(m.latencyMs / 1000).toFixed(2)}s</span>}
          {m.role === "assistant" && m.usage?.tps_est && (
            <span>{typeof m.usage.tps_est === "number" ? m.usage.tps_est.toFixed(1) : m.usage.tps_est} tok/s</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => void navigator.clipboard.writeText(m.content)}
              title="Copy"
            >
              <Clipboard className="mr-1 h-3.5 w-3.5" /> Copy
            </Button>
            {m.role === "assistant" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => onRegenerate?.(m)}
                title="Regenerate"
                disabled={!m.id || isStreaming}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
