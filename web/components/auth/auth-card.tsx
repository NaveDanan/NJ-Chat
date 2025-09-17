"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/utils";
import Link from "next/link";

type Mode = "login" | "register";

export function AuthCard({ mode: initialMode = "login" }: { mode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      await api(endpoint, { method: "POST", body: JSON.stringify({ email, password }) });
      // Navigate to chat
      window.location.href = "/chat";
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/60">
      <CardHeader>
        <CardTitle className="text-2xl">{mode === "login" ? "Welcome back" : "Create an account"}</CardTitle>
        <CardDescription>
          {mode === "login" ? (
            <>Use your email and password to sign in.</>
          ) : (
            <>It’s quick and free. You can switch providers later in Settings.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <Button className="w-full" onClick={submit} disabled={loading}>
          {loading ? (mode === "login" ? "Signing in…" : "Creating…") : mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>Don’t have an account? <button className="underline" onClick={() => setMode("register")}>Create one</button></>
          ) : (
            <>Already have an account? <button className="underline" onClick={() => setMode("login")}>Sign in</button></>
          )}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our <Link className="underline" href="#">Terms</Link> and <Link className="underline" href="#">Privacy Policy</Link>.
        </p>
      </CardContent>
    </Card>
  );
}

