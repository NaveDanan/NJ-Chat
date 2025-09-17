import Link from "next/link";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">NJ‑Chat</h1>
        <p className="text-muted-foreground max-w-xl">A modern, responsive chat UI for LM Studio, Ollama, and OpenAI‑compatible providers. Sign in to start chatting.</p>
        <div className="flex justify-center gap-3">
          <Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/login">Get started</Link>
          <Link className="rounded-md border border-border px-4 py-2" href="/chat">Open chat</Link>
        </div>
      </div>
    </main>
  );
}

