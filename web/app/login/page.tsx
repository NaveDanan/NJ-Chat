import { AuthCard } from "@/components/auth/auth-card";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { title: "Sign in • NJ-Chat" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to NJ‑Chat</h1>
          <p className="text-muted-foreground">Connect to LM Studio, Ollama, or OpenAI‑compatible APIs</p>
        </div>
        <AuthCard />
      </div>
    </main>
  );
}

