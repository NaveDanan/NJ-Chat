"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

type CodeProps = React.HTMLAttributes<HTMLElement> & { inline?: boolean };

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("md prose-invert font-ui-serif", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={{
          code({ inline, className, children, ...props }: CodeProps) {
            const match = /language-(\w+)/.exec(className || "");
            if (inline) return <code className="rounded bg-secondary px-1 py-0.5" {...props}>{children}</code>;
            const lang = match?.[1] || "";
            const text = String(children || "");
            return (
              <pre className="relative overflow-auto rounded-lg border border-border bg-secondary/40 p-3">
                <button
                  onClick={() => navigator.clipboard.writeText(text)}
                  className="absolute right-2 top-2 rounded border border-border bg-background/60 px-2 py-1 text-xs hover:bg-background"
                >
                  Copy
                </button>
                {lang && (
                  <span className="absolute left-2 top-2 rounded border border-border bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {lang}
                  </span>
                )}
                <code className={className} {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

