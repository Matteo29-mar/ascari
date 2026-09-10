import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { Link } from "react-router-dom";

type ChatItem = {
  id: number;
  car?: { title?: string; make?: string; model?: string; coverUrl?: string | null; photos?: string[] | null } | null;
  peer?: { name?: string | null; email?: string | null } | null;
  messages?: { content?: string; readAt?: string | null }[] | null;
};

function normalizeChats(payload: any): ChatItem[] {
  if (Array.isArray(payload)) return payload;
  if (payload?.chats && Array.isArray(payload.chats)) return payload.chats;
  return [];
}

export default function InspectorChatList() {
  const { getToken } = useAuth();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getToken();
      const res = await http.get("/chat", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setChats(normalizeChats(res.data));
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Errore caricamento chat");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1>Chat attive</h1>

      {loading && <p className="muted">Caricamento chat...</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && chats.length === 0 && <p className="muted">Nessuna chat disponibile.</p>}

      {chats.map((c) => {
        const lastMsg = (Array.isArray(c.messages) ? c.messages : [])?.[0];

        const cover =
          c.car?.coverUrl ||
          (Array.isArray(c.car?.photos) ? c.car?.photos?.[0] : null) ||
          "/cars/placeholder.jpg";

        const title =
          c.car?.title ||
          `${c.car?.make ?? ""} ${c.car?.model ?? ""}`.trim() ||
          "Auto";

        return (
          <Link to={`/inspector/chat/${c.id}`} key={c.id} className="chat-row">
            <img src={cover} alt="" className="chat-avatar" />
            <div className="chat-info">
              <strong>{title}</strong>
              <p>{lastMsg?.content || "Nessun messaggio"}</p>
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