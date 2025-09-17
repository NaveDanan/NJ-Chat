"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/utils";
import { useEffect, useState } from "react";

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
  useEffect(() => {
    if (initial) {
      setProvider(initial.provider || "openai");
      setBaseUrl(initial.baseUrl || "");
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
    try {
      const res = await api("/api/models/test", {
        method: "POST",
        body: JSON.stringify({ provider, baseUrl, apiKey }),
      });
      const fetched = res.models || [];
      setModels(fetched);
      if (!model && fetched[0]?.id) setModel(fetched[0].id);
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
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[380px] max-w-[90vw] border-l border-border bg-background p-4 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold">Settings</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            Update provider defaults, tokens, and appearance preferences for this workspace.
          </Dialog.Description>
          <div className="space-y-3">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI-compatible / LM Studio</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
          <div>
            <Label>Background Gradient</Label>
            <Select value={gradient} onValueChange={setGradient}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Gradient" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Solid</SelectItem>
                <SelectItem value="teal">Teal Beam</SelectItem>
                <SelectItem value="ocean">Ocean Radial</SelectItem>
                <SelectItem value="charcoal">Charcoal Sweep</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Base URL</Label>
            <Input className="mt-1" placeholder="http://localhost:1234" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          </div>
            <div>
              <Label>API Key</Label>
              <Input className="mt-1" placeholder="sk-... or lm-studio" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3">
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
              <Label>Default Model</Label>
              <Input className="mt-1" placeholder="e.g. llama3:latest" value={model} onChange={(e) => setModel(e.target.value)} />
              {models.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {models.map((m) => (
                    <Button
                      key={m.id}
                      type="button"
                      size="sm"
                      variant={m.id === model ? "secondary" : "outline"}
                      onClick={() => setModel(m.id)}
                    >
                      {m.id}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Temperature</Label>
                <Input className="mt-1" type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value || "0.7"))} />
              </div>
              <div>
                <Label>Max Tokens</Label>
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





