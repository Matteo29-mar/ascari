import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { Link } from "react-router-dom";

type Chat = {
  id: number;
  messages?: { content?: string; readAt?: string | null }[] | null;
  offer?: {
    car?: {
      title?: string | null;
      coverUrl?: string | null;
      photos?: string[] | null;
    } | null;
  } | null;
};

// ✅ normalizza: backend può restituire [] oppure {chats:[]} oppure {data:[]} ecc.
function normalizeChats(payload: any): Chat[] {
  if (Array.isArray(payload)) return payload as Chat[];

  if (payload && Array.isArray(payload.chats)) return payload.chats as Chat[];
  if (payload && Array.isArray(payload.data)) return payload.data as Chat[];
  if (payload && Array.isArray(payload.items)) return payload.items as Chat[];
  if (payload && Array.isArray(payload.result)) return payload.result as Chat[];

  return [];
}

export default function ChatList() {
  const { getToken } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
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

      setChats(normalizeChats(res.data));
    } catch (e: any) {
      console.error("Errore caricamento chat:", e);
      setErr(e?.response?.data?.error || e?.message || "Errore caricamento chat");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const safeChats = Array.isArray(chats) ? chats : [];

  return (
    <div>
      <h1>Chat attive</h1>

      {loading && <p className="muted">Caricamento chat...</p>}
      {err && <p style={{ color: "var(--danger)" }}>{err}</p>}

      {!loading && safeChats.length === 0 && (
        <p className="muted">Nessuna chat disponibile.</p>
      )}

      {safeChats.map((c) => {
        const msgs = Array.isArray(c.messages) ? c.messages : [];
        const lastMsg = msgs[0];

        const cover =
          c.offer?.car?.coverUrl ||
          (Array.isArray(c.offer?.car?.photos) ? c.offer?.car?.photos?.[0] : null) ||
          "/cars/placeholder.jpg";

        return (
          <Link to={`/chat/${c.id}`} key={c.id} className="chat-row">
            {/* FOTO AUTO */}
            <img src={cover} alt="" className="chat-avatar" />

            {/* INFO */}
            <div className="chat-info">
              <strong>{c.offer?.car?.title || "Auto"}</strong>
              <p>{lastMsg?.content || "Nessun messaggio"}</p>
            </div>

            {/* STATO */}
            <div className="chat-meta">
              {!lastMsg?.readAt && <span className="chat-status-dot" />}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
