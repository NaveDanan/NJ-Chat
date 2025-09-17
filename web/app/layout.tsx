import type { Metadata } from "next";
import "./globals.css";
import "highlight.js/styles/github-dark.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "NJ-Chat",
  description: "Modern chat UI for multi-provider LLMs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
