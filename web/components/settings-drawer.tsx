"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const DEFAULT_BASE_URL = {
  openai: "http://localhost:1234",
  ollama: "http://localhost:11434",
} as const;
type ProviderKey = keyof typeof DEFAULT_BASE_URL;

export function SettingsDrawer({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: any }) {
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [gradient, setGradient] = useState("none");
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const previousProvider = useRef(provider);
  const providerDefaultBaseUrl = DEFAULT_BASE_URL[(provider as ProviderKey)] || DEFAULT_BASE_URL.openai;

  useEffect(() => {
    if (initial) {
      const initialProvider = (initial.provider || "openai") as ProviderKey | string;
      setProvider(initialProvider as string);
      const fallback = DEFAULT_BASE_URL[(initialProvider as ProviderKey)] || "";
      const initialBase = typeof initial.baseUrl === "string" ? initial.baseUrl.trim() : "";
      setBaseUrl(initialBase || fallback);
      setApiKey(initial.apiKey || "");
      setModel(initial.model || "");
      setTemperature(initial.temperature ?? 0.7);
      setMaxTokens(initial.max_tokens ?? 512);
      setGradient(initial.gradient || "none");
    }
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await api("/api/models");
        setModels(res.models || []);
      } catch {
        setModels([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    setTestMessage(null);
  }, [provider, baseUrl, apiKey]);

  useEffect(() => {
    const prev = previousProvider.current as ProviderKey | string;
    previousProvider.current = provider;
    const nextDefault = DEFAULT_BASE_URL[(provider as ProviderKey)];
    if (!nextDefault) return;
    setBaseUrl((current) => {
      const trimmed = (current || "").trim();
      const prevDefault = DEFAULT_BASE_URL[(prev as ProviderKey)] || "";
      if (!trimmed || trimmed === prevDefault) {
        return nextDefault;
      }
      return trimmed;
    });
  }, [provider]);

  useEffect(() => {
    if (!open) return;
    if (provider !== "ollama") return;
    const normalizedBase = (baseUrl || "").trim() || providerDefaultBaseUrl;
    if (!normalizedBase) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/models/test", {
          method: "POST",
          body: JSON.stringify({ provider, baseUrl: normalizedBase, apiKey }),
        });
        if (cancelled) return;
        const fetched = res.models || [];
        setModels(fetched);
        setModel((prev) => prev || fetched[0]?.id || prev);
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, baseUrl, apiKey, open, providerDefaultBaseUrl]);

  async function save() {
    const payload = { provider, baseUrl, apiKey, model, temperature, max_tokens: maxTokens, gradient };
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("settings-updated", { detail: payload } as any));
    }
    onOpenChange(false);
  }

  async function testConnection() {
    setTesting(true);
    setTestMessage(null);
    const normalizedBaseUrl = (baseUrl || "").trim() || providerDefaultBaseUrl;
    setBaseUrl(normalizedBaseUrl);
    try {
      const res = await api("/api/models/test", {
        method: "POST",
        body: JSON.stringify({ provider, baseUrl: normalizedBaseUrl, apiKey }),
      });
      const fetched = res.models || [];
      setModels(fetched);
      setModel((prev) => prev || fetched[0]?.id || prev);
      const count = fetched.length;
      setTestMessage({ ok: true, message: count ? `Connected. ${count} model${count === 1 ? "" : "s"} available.` : "Connected, but the provider returned no models." });
    } catch (e: any) {
      setTestMessage({ ok: false, message: e?.message || "Connection failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="font-ui-serif fixed inset-y-0 right-0 z-50 w-[380px] max-w-[90vw] border-l border-border bg-background p-4 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">Settings</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Update provider defaults, tokens, and appearance preferences for this workspace.
          </Dialog.Description>
          <div className="space-y-3">
            <div>
              <Label className="font-bold">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="mt-1 bg-background">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="openai">OpenAI-compatible / LM Studio</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-bold">Background Gradient</Label>
              <Select value={gradient} onValueChange={setGradient}>
                <SelectTrigger className="mt-1 bg-background"><SelectValue placeholder="Gradient" /></SelectTrigger>
                <SelectContent className="mt-1 bg-background">
                  <SelectItem value="none">Solid</SelectItem>
                  <SelectItem value="teal">Teal Beam</SelectItem>
                  <SelectItem value="ocean">Ocean Radial</SelectItem>
                  <SelectItem value="charcoal">Charcoal Sweep</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="font-bold">Base URL</Label>
              <Input className="mt-1" placeholder={providerDefaultBaseUrl} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <div>
              <Label className="font-bold">API Key</Label>
              <Input className="mt-1" placeholder="sk-... or lm-studio" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3 text-right">
              <Button type="button" variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
              {testMessage && (
                <span className={`text-sm ${testMessage.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {testMessage.message}
                </span>
              )}
            </div>
            <div>
              <Label className="font-bold">Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="font-ui-serif"><SelectValue placeholder="openai/" /></SelectTrigger>
                  <SelectContent className="bg-background font-georgia">
                    {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.id}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="font-bold">Temperature</Label>
                <Input className="mt-1" type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value || "0.7"))} />
              </div>
              <div>
                <Label className="font-bold">Max Tokens</Label>
                <Input className="mt-1" type="number" min={64} max={32768} step={64} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value || "512"))} />
              </div>
            </div>
            <div className="pt-2 text-right">
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
