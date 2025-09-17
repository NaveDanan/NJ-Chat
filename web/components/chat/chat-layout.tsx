"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, API_BASE } from "@/lib/utils";
import { ChevronDown, ChevronsLeft, ChevronsRight, Folder as FolderIcon, LogOut, Pencil, Plus, Search, Settings, Square, Star } from "lucide-react";
import MessageItem from "@/components/chat/MessageItem";
import { SettingsDrawer } from "@/components/settings-drawer";
import * as Dialog from "@radix-ui/react-dialog";

type ChatMeta = { id: string; title: string; model?: string; updatedAt?: string; folder?: string; pinned?: boolean };
type Message = { id?: string; role: "user" | "assistant"; content: string; model?: string; usage?: any; thinking?: string; thinkingTime?: number };

export default function ChatLayout() {
  const [me, setMe] = useState<any>(null);
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(512);
  const [model, setModel] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const [sidebarW, setSidebarW] = useState<number>(280);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const resizerRef = useRef<HTMLDivElement | null>(null);
  const [thinking, setThinking] = useState<string>("");
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const thinkingRef = useRef<string>("");
  const thinkingStartRef = useRef<number | null>(null);
  const [gradient, setGradient] = useState<string>("none");
  const [showSystem, setShowSystem] = useState(false);
  const [systemText, setSystemText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/me");
        setMe(r);
        setTemperature(r?.settings?.temperature ?? 0.7);
        setMaxTokens(r?.settings?.max_tokens ?? 512);
        setGradient(r?.settings?.gradient || "none");
        // Set model from user settings first
        if (r?.settings?.model) {
          setModel(r.settings.model);
        }
        await refreshModels(r);
        await refreshChats(true);
        const c = localStorage.getItem("sidebarCollapsed");
        if (c === "1") setCollapsed(true);
      } catch (_) {
        window.location.href = "/login";
      }
    })();
  }, []);

  useEffect(() => {
    function handleSettingsUpdated(event: any) {
      const detail = event?.detail || {};
      setMe((prev: any) => prev ? { ...prev, settings: { ...(prev.settings || {}), ...detail } } : prev);
      if (typeof detail.gradient === "string") setGradient(detail.gradient);
      if (typeof detail.temperature === "number") setTemperature(detail.temperature);
      if (typeof detail.max_tokens === "number") setMaxTokens(detail.max_tokens);
      if (typeof detail.model === "string") setModel(detail.model);
      (async () => {
        try {
          const res = await api<{ models: { id: string }[] }>("/api/models");
          const fetched = res.models || [];
          setModels(fetched);
          setModel((current) => {
            if (detail.model && fetched.some((m) => m.id === detail.model)) return detail.model;
            if (current && fetched.some((m) => m.id === current)) return current;
            return fetched[0]?.id || current || "";
          });
        } catch {}
      })();
    }
    if (typeof window !== "undefined") {
      window.addEventListener("settings-updated", handleSettingsUpdated as any);
      return () => window.removeEventListener("settings-updated", handleSettingsUpdated as any);
    }
  }, [setGradient, setTemperature, setMaxTokens, setModel, setModels, setMe]);

  // Sidebar resizer
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const startX = e.clientX;
      const startW = sidebarW;
      function onMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        let w = Math.min(Math.max(220, startW + dx), 420);
        setSidebarW(w);
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      if (!collapsed) {
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }
    }
    const el = resizerRef.current;
    if (el) el.addEventListener("mousedown", onMouseDown as any);
    return () => { if (el) el.removeEventListener("mousedown", onMouseDown as any); };
  }, [sidebarW, collapsed]);

  function toggleCollapsed() {
    const next = !collapsed; setCollapsed(next);
    try { localStorage.setItem("sidebarCollapsed", next ? "1" : "0"); } catch {}
  }

  async function refreshModels(userData?: any) {
    try {
      const r = await api<{ models: { id: string }[] }>("/api/models");
      const fetchedModels = r.models || [];
      setModels(fetchedModels);
      
      // Update model selection logic
      setModel((currentModel) => {
        // If we have a current model and it's still available, keep it
        if (currentModel && fetchedModels.some((m) => m.id === currentModel)) {
          return currentModel;
        }
        
        // If we have user settings model and it's available, use it
        const userModel = userData?.settings?.model || me?.settings?.model;
        if (userModel && fetchedModels.some((m) => m.id === userModel)) {
          return userModel;
        }
        
        // Fall back to first available model if no model is set
        if (!currentModel && fetchedModels.length > 0) {
          return fetchedModels[0].id;
        }
        
        // Keep current model even if not in list (user might want to type it manually)
        return currentModel;
      });
    } catch {}
  }

  async function refreshChats(openFirst = false) {
    const r = await api<{ chats: ChatMeta[] }>("/api/chats");
    setChats(r.chats || []);
    if (openFirst && r.chats?.length) openChat(r.chats[0].id);
    if (openFirst && !r.chats?.length) await newChat();
  }

  async function openChat(id: string) {
    setChatId(id);
    const r = await api<{ chat: { messages: Message[] } }>(`/api/chats/${id}`);
    setMessages(r.chat.messages || []);
  }

  async function newChat() {
    const r = await api<{ chat: ChatMeta }>("/api/chats", { method: "POST" });
    setChats((prev) => [r.chat, ...prev]);
    openChat(r.chat.id);
  }
  async function deleteChat(id: string) {
    await api(`/api/chats/${id}`, { method: "DELETE" });
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (chatId === id) setChatId(null);
    await refreshChats(true);
  }

  function scrollToBottom() {
    setTimeout(() => {
      const el = document.getElementById("messages");
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  async function send() {
    if (streaming || !content.trim()) return;
    if (!chatId) await newChat();
    
    const text = content.trim();
    setContent("");
    setThinking("");
    setThinkingStartTime(null);
    thinkingRef.current = "";
    thinkingStartRef.current = null;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setTimeout(scrollToBottom);

    // Prepare assistant message
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const idx = messages.length + 1; // assistant index after adding user
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, model, temperature, max_tokens: maxTokens }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let eventName: string | null = null;
      let dataBuf: string[] = [];

      function dispatch() {
        if (eventName && dataBuf.length) {
          const raw = dataBuf.join("\n");
          try {
            const payload = JSON.parse(raw);
            if (eventName === "ack") {
              setMessages((m) => {
                const copy = m.slice();
                const userIndex = copy.length - 2;
                if (copy[userIndex]) {
                  copy[userIndex] = { ...copy[userIndex], id: payload.messageId || copy[userIndex].id } as any;
                }
                return copy;
              });
            } else if (eventName === "delta") {
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                copy[last] = { ...copy[last], content: (copy[last].content || "") + (payload.content || "") } as any;
                return copy;
              });
            } else if (eventName === "thinking") {
              if (!thinkingStartRef.current) {
                const start = Date.now();
                thinkingStartRef.current = start;
                setThinkingStartTime(start);
              }
              const chunk = payload.content || "";
              if (chunk) {
                const newThinking = (thinkingRef.current || "") + chunk;
                thinkingRef.current = newThinking;
                setThinking(newThinking);
                // Update the current assistant message with thinking content
                setMessages((m) => {
                  const copy = m.slice();
                  const last = copy.length - 1;
                  if (copy[last] && copy[last].role === "assistant") {
                    copy[last] = { ...copy[last], thinking: newThinking } as any;
                  }
                  return copy;
                });
              }
            } else if (eventName === "final") {
              const start = thinkingStartRef.current;
              const thinkingTime = start ? (Date.now() - start) / 1000 : undefined;
              const latestThinking = thinkingRef.current;
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                if (copy[last]) {
                  copy[last] = {
                    ...copy[last],
                    id: payload.messageId || copy[last]?.id,
                    model: payload.model,
                    usage: payload.usage,
                    latencyMs: payload.latencyMs,
                    thinking: latestThinking || undefined,
                    thinkingTime: thinkingTime
                  } as any;
                }
                return copy;
              });
              thinkingRef.current = "";
              thinkingStartRef.current = null;
              setThinking("");
              setThinkingStartTime(null);
            } else if (eventName === "error") {
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                if (copy[last]) {
                  copy[last] = { ...copy[last], content: (copy[last].content || "") + "\n[Error] " + (payload?.message || "") } as any;
                }
                return copy;
              });
              thinkingRef.current = "";
              thinkingStartRef.current = null;
              setThinking("");
              setThinkingStartTime(null);
            }
          } catch {}
        }
        eventName = null;
        dataBuf = [];
        scrollToBottom();
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idxNl;
        while ((idxNl = buf.indexOf("\n")) >= 0) {
          const rawLine = buf.slice(0, idxNl);
          buf = buf.slice(idxNl + 1);
          const line = rawLine.replace(/\r$/, "");
          if (line === "") {
            dispatch();
            continue;
          }
          if (line.startsWith(":")) continue; // comment
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith("data:")) {
            dataBuf.push(line.slice(5).trim());
            continue;
          }
        }
      }
      // flush any remaining buffered event
      if (dataBuf.length) dispatch();
    } catch (e) {
      setMessages((m) => {
        const copy = m.slice();
        const lastIdx = copy.length - 1;
        if (copy[lastIdx]) {
          copy[lastIdx] = { ...copy[lastIdx], content: (copy[lastIdx].content || "") + "\n[Error]" };
        }
        return copy;
      });
      thinkingRef.current = "";
      thinkingStartRef.current = null;
      setThinking("");
      setThinkingStartTime(null);
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshChats();
      scrollToBottom();
    }
  }

  async function regenerateFromMessage(msg: Message) {
    if (!chatId || !msg.id || streaming) return;
    setThinking("");
    setThinkingStartTime(null);
    thinkingRef.current = "";
    thinkingStartRef.current = null;
    
    // Remove the last assistant message (previous LLM response) before regenerating
    setMessages((m) => {
      const copy = m.slice();
      // Find and remove the last assistant message
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy.splice(i, 1);
          break;
        }
      }
      return copy;
    });
    
    // Add new empty assistant message for the regenerated response
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    try {
      const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages/${msg.id}/regenerate`, { method: "POST", credentials: "include", signal: controller.signal });
      if (!res.ok) throw new Error(await res.text());
      const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buf = ""; let eventName: string | null = null; let dataBuf: string[] = [];
      function dispatch() {
        if (eventName && dataBuf.length) {
          try {
            const payload = JSON.parse(dataBuf.join("\n"));
            if (eventName === "delta") {
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                if (copy[last]) {
                  copy[last] = { ...copy[last], content: (copy[last].content || "") + (payload.content || "") } as any;
                }
                return copy;
              });
            } else if (eventName === "thinking") {
              if (!thinkingStartRef.current) {
                const start = Date.now();
                thinkingStartRef.current = start;
                setThinkingStartTime(start);
              }
              const chunk = payload.content || "";
              if (chunk) {
                const newThinking = (thinkingRef.current || "") + chunk;
                thinkingRef.current = newThinking;
                setThinking(newThinking);
                // Update the current assistant message with thinking content
                setMessages((m) => {
                  const copy = m.slice();
                  const last = copy.length - 1;
                  if (copy[last] && copy[last].role === "assistant") {
                    copy[last] = { ...copy[last], thinking: newThinking } as any;
                  }
                  return copy;
                });
              }
            } else if (eventName === "final") {
              const start = thinkingStartRef.current;
              const thinkingTime = start ? (Date.now() - start) / 1000 : undefined;
              const latestThinking = thinkingRef.current;
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                if (copy[last]) {
                  copy[last] = {
                    ...copy[last],
                    id: payload.messageId || copy[last]?.id,
                    model: payload.model,
                    usage: payload.usage,
                    latencyMs: payload.latencyMs,
                    thinking: latestThinking || undefined,
                    thinkingTime: thinkingTime
                  } as any;
                }
                return copy;
              });
              thinkingRef.current = "";
              thinkingStartRef.current = null;
              setThinking("");
              setThinkingStartTime(null);
            } else if (eventName === "error") {
              setMessages((m) => {
                const copy = m.slice();
                const last = copy.length - 1;
                if (copy[last]) {
                  copy[last] = { ...copy[last], content: (copy[last].content || "") + "\n[Error] " + (payload.message || "") } as any;
                }
                return copy;
              });
              thinkingRef.current = "";
              thinkingStartRef.current = null;
              setThinking("");
              setThinkingStartTime(null);
            }
          } catch {}
        }
        eventName = null;
        dataBuf = [];
        scrollToBottom();
      }
      while (true) {
        const { value, done } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); let idx; while ((idx = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1); if (!line) { dispatch(); continue; } if (line.startsWith(":")) continue; if (line.startsWith("event:")) { eventName = line.slice(6).trim(); continue; } if (line.startsWith("data:")) { dataBuf.push(line.slice(5).trim()); continue; } }
      }
      if (dataBuf.length) dispatch();
    } finally {
      setStreaming(false); abortRef.current = null; refreshChats(); scrollToBottom();
    }
  }

  async function editMessage(target: Message) {
    if (!chatId || target.role !== "user" || !target.id) return;
    const updated = window.prompt("Edit message", target.content || "");
    if (updated === null) return;
    try {
      await api(`/api/chats/${chatId}/messages/${target.id}`, { method: "PATCH", body: JSON.stringify({ content: updated }) });
      setMessages((prev) => prev.map((msg) => (msg.id === target.id ? { ...msg, content: updated } : msg)));
    } catch (e: any) {
      alert(e?.message || "Failed to update message");
    }
  }

  function gradientBg(name: string) {
    if (name === "teal") return "radial-gradient(800px 240px at 50% -80px, rgba(5,171,179,0.25), transparent), linear-gradient(180deg, transparent 0, transparent 220px, hsl(var(--background)) 220px)";
    if (name === "ocean") return "radial-gradient(600px 200px at 10% -60px, rgba(38,148,156,0.35), transparent), radial-gradient(600px 200px at 90% -60px, rgba(5,171,179,0.25), transparent)";
    if (name === "charcoal") return "linear-gradient(180deg, rgba(59,65,73,0.25), transparent 220px)";
    return "";
  }
  async function stop() {
    // Abort the client-side request
    abortRef.current?.abort();
    
    // Also send a request to the server to stop generation
    if (chatId) {
      try {
        await api(`/api/chats/${chatId}/stop`, { method: "POST" });
      } catch (e) {
        // Silently ignore errors since the main purpose is to abort the client request
        console.warn("Failed to send stop request to server:", e);
      }
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="grid h-screen min-h-0 grid-cols-1 md:grid-cols-[var(--sidebar)_1fr]" style={{ ['--sidebar' as any]: `${collapsed ? 64 : sidebarW}px` }}>
      {/* Sidebar */}
      <aside className="hidden min-h-0 border-r border-border bg-secondary/30 md:flex md:flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3">
          {/* with logo image next to title */}
          {!collapsed && (
            <>
              <img src="images/Logo_round_icon.png" alt="Logo-icon" className="h-6 w-6" />
              <div className="font-semibold">NJ‑Chat</div>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleCollapsed} title={collapsed ? "Expand" : "Collapse"}>
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
            {!collapsed && <ThemeToggle />}

          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 p-3">
          {collapsed ? (
            <Button size="icon" className="mx-auto" onClick={newChat}><Plus className="h-4 w-4" /></Button>
          ) : (
            <Button className="w-full" onClick={newChat}><Plus className="mr-2 h-4 w-4" /> New Chat</Button>
          )}
        </div>
        {!collapsed && (
          <div className="mx-2 mb-2 flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            <input className="w-full bg-transparent outline-none" placeholder="Search chats" />
          </div>
        )}
        
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {Object.entries(
            chats.reduce((acc: Record<string, ChatMeta[]>, c) => {
              const f = (c.folder || "").trim();
              acc[f] = acc[f] || [];
              acc[f].push(c);
              return acc;
            }, {})
          ).sort(([a],[b]) => a.localeCompare(b)).map(([folder, arr]) => {
            const sorted = arr.sort((a,b) => (a.pinned === b.pinned ? 0 : b.pinned ? 1 : -1) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
            return (
              <div key={folder} className="mb-2">
                {!collapsed && <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{folder || "Chats"}</div>}
                {sorted.map((c) => (
                  <div key={c.id} className={`rounded-md px-3 py-2 text-sm hover:bg-secondary ${chatId === c.id ? "bg-secondary" : ""}`}>
                    <div className="flex items-center gap-2">
                      <button title={c.pinned ? "Unpin" : "Pin"} onClick={async (e) => { e.stopPropagation(); await api(`/api/chats/${c.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !c.pinned }) }); await refreshChats(); }} className="shrink-0">
                        <Star className={`h-4 w-4 ${c.pinned ? "text-primary" : "text-muted-foreground"}`} fill={c.pinned ? "currentColor" : "none"} />
                      </button>
                      <button className={`flex-1 text-left min-w-0 ${collapsed ? 'flex justify-center' : ''}`} onClick={() => openChat(c.id)} title={c.title}>
                        {collapsed ? (
                          <div className="h-6 w-6 rounded bg-secondary/60" />
                        ) : (
                          <>
                            <div className="min-w-0 truncate font-medium font-ui-serif">{c.title}</div>
                            <div className="min-w-0 truncate text-xs text-muted-foreground">{c.model} • {c.updatedAt && new Date(c.updatedAt).toLocaleString()}</div>
                          </>
                        )}
                      </button>
                      {!collapsed && (
                        <>
                          <button title="Rename" onClick={async (e) => { e.stopPropagation(); const name = prompt("Rename chat", c.title); if (name !== null) { await api(`/api/chats/${c.id}`, { method: "PATCH", body: JSON.stringify({ title: name }) }); await refreshChats(); } }}><Pencil className="h-4 w-4 text-muted-foreground" /></button>
                          <button title="Move to folder" onClick={async (e) => { e.stopPropagation(); const f = prompt("Move to folder (blank to unset)", c.folder || ""); if (f !== null) { await api(`/api/chats/${c.id}`, { method: "PATCH", body: JSON.stringify({ folder: f.trim() }) }); await refreshChats(); } }}>
                            <FolderIcon className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </>
                      )}
                    </div>
                    {!collapsed && (
                      <div className="mt-1 text-right">
                        <button className="text-xs text-muted-foreground underline" onClick={() => deleteChat(c.id)}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {!collapsed && (
          <div className="relative shrink-0">
            <div ref={resizerRef} className="absolute -right-1 top-0 h-8 w-2 cursor-col-resize rounded bg-transparent hover:bg-primary/60" title="Drag to resize" />
          </div>
        )}
        <div className="shrink-0 border-t border-border p-3 text-xs text-muted-foreground">
          {!collapsed && me?.user?.email}
          {/* align the button to the right next to the email */}
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={logout} title="Logout"><LogOut className="h-4 w-4 text-muted-foreground" /></Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 px-3 py-2">
          {/* <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Model</span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select model" /></SelectTrigger>
              <SelectContent>
                {models.map((m) => <SelectItem key={m.id} value={m.id}>{m.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Context</span>
            <Input className="w-24" type="number" min={64} max={32768} step={64} value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value || "512"))} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Temp</span>
            <Input className="w-20" type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value || "0.7"))} />
          </div> */}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={async () => { if (!chatId) return; const r = await api(`/api/chats/${chatId}`); setSystemText(r?.chat?.system || ""); setShowSystem(true); }}>System</Button>
            <Button variant="secondary" size="icon" title="Settings" onClick={() => setShowSettings(true)}><Settings className="h-4 w-4" /></Button>
          </div>
        </header>

        <section id="messages" className="flex-1 space-y-3 overflow-auto p-4" style={{ background: gradientBg(gradient) }}>
          {messages.map((m, i) => {
            const isLastMessage = i === messages.length - 1;
            const isStreamingThisMessage = streaming && isLastMessage && m.role === "assistant";
            return (<MessageItem key={i} m={m as any} onRegenerate={regenerateFromMessage} onEdit={editMessage} isStreaming={isStreamingThisMessage} />);
          })}

        </section>

        <footer className="border-t border-border bg-background/60 p-3">
          {/* <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "**bold**")}>B</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "*italic*")}>I</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n# Heading 1\n")}>H1</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n## Heading 2\n")}>H2</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n- item\n- item\n")}>•</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n1. item\n2. item\n")}>1.</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n```\ncode\n```\n")}>{`{}`}</Button>
            <Button variant="outline" size="sm" onClick={() => setContent((v) => v + "\n> quote\n")}>❝</Button>
            <div className="ml-auto" />
            <Button variant="ghost" size="sm" onClick={() => setContent((v) => "Summarize the following text:\n\n" + v)}>Summarize</Button>
            <Button variant="ghost" size="sm" onClick={() => setContent((v) => "Translate the following to English:\n\n" + v)}>Translate</Button>
          </div> */}
          <div className="mx-auto flex w-full max-w-3xl items-start gap-2">
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Send a message…" className="min-h-[44px] flex-1" rows={3}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            {streaming ? (
              <Button onClick={stop} variant="outline" title="Stop generation">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={send} disabled={!content.trim()}>Send</Button>
            )}
          </div>
        </footer>
      </main>
      <SettingsDrawer open={showSettings} onOpenChange={(o) => { setShowSettings(o); if (!o) { setGradient(me?.settings?.gradient || gradient); } }} initial={me?.settings} />
      <Dialog.Root open={showSystem} onOpenChange={setShowSystem}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-background p-4 shadow-xl">
            <Dialog.Title className="mb-1 text-lg font-semibold">System Prompt</Dialog.Title>
            <Dialog.Description className="mb-3 text-sm text-muted-foreground">
              Set the instruction sent with every message to influence the assistant\u2019s behaviour.
            </Dialog.Description>
            <Textarea rows={8} value={systemText} onChange={(e) => setSystemText(e.target.value)} placeholder="You are a helpful assistant." />
            <div className="mt-3 text-right">
              <Button variant="secondary" className="mr-2" onClick={() => setShowSystem(false)}>Close</Button>
              <Button onClick={async () => { if (!chatId) return; await api(`/api/chats/${chatId}`, { method: "PATCH", body: JSON.stringify({ system: systemText }) }); setShowSystem(false); }}>Save</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}







