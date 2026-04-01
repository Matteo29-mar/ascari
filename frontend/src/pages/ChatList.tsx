// frontend/src/pages/ChatList.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { Link, useLocation } from "react-router-dom";

type CarMini = {
  id?: number;
  title?: string | null;
  make?: string | null;
  model?: string | null;
  coverUrl?: string | null;
  photos?: string[] | null;
};

type MsgPreview = {
  content?: string | null;
  readAt?: string | null;
};

type ChatRow = {
  id: number | string;
  kind?: "OFFER" | "INSPECTION" | "GENERIC" | string;
  car?: CarMini | null;
  peer?: { id: string; name?: string | null; email?: string | null } | null;
  messages?: MsgPreview[] | null;
  inspectionStatus?: string | null;
};

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeChats(payload: any): ChatRow[] {
  if (payload && Array.isArray(payload.chats)) return payload.chats as ChatRow[];
  if (Array.isArray(payload)) return payload as ChatRow[];
  if (payload && Array.isArray(payload.data)) return payload.data as ChatRow[];
  if (payload && Array.isArray(payload.items)) return payload.items as ChatRow[];
  if (payload && Array.isArray(payload.result)) return payload.result as ChatRow[];
  return [];
}

export default function ChatList() {
  const { getToken } = useAuth();
  const location = useLocation();

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const isInspectorRoute = location.pathname.startsWith("/inspector/chat");
  const chatBasePath = isInspectorRoute ? "/inspector/chat" : "/chat";

  async function loadList() {
    setLoading(true);
    setErr(null);

    try {
      const token = await getToken();
      if (!token) {
        setErr("Utente non autenticato");
        setChats([]);
        return;
      }

      const res = await http.get("/chat", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const list = normalizeChats(res.data);

      const cleaned = list
        .map((c) => ({
          ...c,
          id: Number(c.id),
        }))
        .filter((c) => Number.isFinite(c.id) && c.id > 0);

      setChats(cleaned);
    } catch (e: any) {
      console.error("Errore caricamento chat:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore caricamento chat");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeChats = useMemo(() => safeArray<ChatRow>(chats), [chats]);

  return (
    <div>
      <h1>Chat attive</h1>

      {loading && <p className="muted">Caricamento chat...</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && !err && safeChats.length === 0 && (
        <p className="muted">Nessuna chat disponibile.</p>
      )}

      {safeChats.map((c) => {
        const msgs = safeArray<MsgPreview>(c.messages);
        const lastMsg = msgs[0];

        const car = c.car ?? null;

        const cover =
          car?.coverUrl ||
          (Array.isArray(car?.photos) ? car?.photos?.[0] : null) ||
          "/cars/placeholder.jpg";

        const title =
          car?.title ||
          `${car?.make ?? ""} ${car?.model ?? ""}`.trim() ||
          "Auto";

        const chatId = Number(c.id);
        if (!Number.isFinite(chatId) || chatId <= 0) return null;

        return (
          <Link to={`${chatBasePath}/${chatId}`} key={chatId} className="chat-row">
            <img src={cover} alt="" className="chat-avatar" />

            <div className="chat-info">
              <strong>{title}</strong>

              <p style={{ whiteSpace: "pre-wrap" }}>
                {lastMsg?.content || "Nessun messaggio"}
              </p>

              {c.kind === "INSPECTION" && c.inspectionStatus === "CANCELLED" && (
                <span className="muted" style={{ fontSize: 12 }}>
                  (Perizia annullata)
                </span>
              )}
            </div>

            <div className="chat-meta">
              {!lastMsg?.readAt && <span className="chat-status-dot" />}
            </div>
          </Link>
        );
      })}
    </div>
  );
}