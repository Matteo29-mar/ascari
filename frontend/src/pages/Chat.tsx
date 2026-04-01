// frontend/src/pages/Chat.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { http } from "../api";
import { useAuth } from "@clerk/clerk-react";

type Message = {
  id: number;
  senderId: string;
  content: string;
  createdAt: string;
};

function renderMessageContent(content: string) {
  const lines = content.split("\n");

  return lines.map((line, index) => {
    const trimmed = line.trim();

    const mapsMatch = trimmed.match(/^Google Maps:\s*(https?:\/\/\S+)$/i);
    if (mapsMatch) {
      const url = mapsMatch[1];

      return (
        <div key={index} style={{ marginTop: index === 0 ? 0 : 4 }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#7dd3fc",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Apri su Google Maps
          </a>
        </div>
      );
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRegex);

    return (
      <div
        key={index}
        style={{
          marginTop: index === 0 ? 0 : 4,
          minHeight: 22,
        }}
      >
        {parts.map((part, partIndex) => {
          const isUrl = /^https?:\/\/[^\s]+$/i.test(part);

          if (isUrl) {
            return (
              <a
                key={partIndex}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "#7dd3fc",
                  textDecoration: "underline",
                  wordBreak: "break-all",
                }}
              >
                {part}
              </a>
            );
          }

          return <span key={partIndex}>{part}</span>;
        })}
      </div>
    );
  });
}

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const chatId = useMemo(() => {
    if (!id || id === "undefined") return null;
    const n = Number(id);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [id]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [deletePromptOpen, setDeletePromptOpen] = useState(false);
  const [deletePromptText, setDeletePromptText] = useState(
    "La perizia è stata annullata. Vuoi eliminare la chat?"
  );
  const [deleteBusy, setDeleteBusy] = useState(false);

  function isInspectorRoute() {
    return window.location.pathname.startsWith("/inspector/chat");
  }

  function goBack() {
    if (isInspectorRoute()) navigate("/inspector/chat");
    else navigate("/chat");
  }

  function popupKey(cid: number) {
    return `chat_cancelled_popup_shown_${cid}`;
  }

  function refreshUnreadBadge() {
    window.dispatchEvent(new Event("ascari:refresh-chat-unread"));
  }

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }

  async function loadChat() {
    if (!chatId) return;

    try {
      const headers = await authHeaders();
      const { data } = await http.get(`/chat/${chatId}`, { headers });

      setChatInfo(data);
      setMessages(data.messages || []);

      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);

      refreshUnreadBadge();

      const myId = data?.meId as string | undefined;
      const kind = data?.kind as string | undefined;
      const inspectionStatus = data?.inspectionStatus as string | null | undefined;
      const sellerId = data?.sellerId as string | undefined;

      const shouldPrompt =
        !!myId &&
        kind === "INSPECTION" &&
        inspectionStatus === "CANCELLED" &&
        sellerId === myId;

      if (shouldPrompt) {
        const already = localStorage.getItem(popupKey(chatId));
        if (!already) {
          localStorage.setItem(popupKey(chatId), "1");
          setDeletePromptText(
            "Ci dispiace ma per questa data non è più possibile la perizia. Vuoi eliminare la chat?"
          );
          setDeletePromptOpen(true);
        }
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        e?.response?.data?.error ?? e?.message ?? "Errore caricamento chat";
      alert(msg);

      if (status === 403 || status === 404 || status === 400) {
        goBack();
      }
    }
  }

  useEffect(() => {
    if (!chatId) {
      goBack();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    loadChat();
    const interval = setInterval(loadChat, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    resizeTextarea();
  }, [input]);

  async function sendMessage() {
    if (!chatId) return;
    if (!input.trim()) return;
    if (sending) return;

    try {
      setSending(true);
      const headers = await authHeaders();

      await http.post(
        `/chat/${chatId}/message`,
        { content: input },
        { headers }
      );

      setInput("");

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }, 0);

      await loadChat();
      refreshUnreadBadge();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore invio messaggio");
    } finally {
      setSending(false);
    }
  }

  async function deleteChat() {
    if (!chatId) return;

    try {
      setDeleteBusy(true);
      const headers = await authHeaders();
      await http.delete(`/chat/${chatId}`, { headers });
      setDeletePromptOpen(false);
      refreshUnreadBadge();
      goBack();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore eliminazione chat");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!chatId) return <p style={{ padding: 20 }}>Caricamento chat…</p>;
  if (!chatInfo) return <p style={{ padding: 20 }}>Caricamento chat…</p>;

  const myId = chatInfo.meId as string;
  const otherUser = chatInfo.peer;

  const displayName =
    otherUser?.name && String(otherUser.name).trim() !== ""
      ? otherUser.name
      : otherUser?.email ?? "Utente";

  return (
    <div style={{ padding: 20 }}>
      <h2 className="h2">Chat con {displayName}</h2>

      <div className="chat-header">
        <button onClick={goBack} className="btn secondary back-chat-btn">
          ← Indietro
        </button>
      </div>

      <div
        style={{
          background: "#111",
          padding: 20,
          height: "60vh",
          overflowY: "auto",
          borderRadius: 10,
          marginTop: 20,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: m.senderId === myId ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                background: m.senderId === myId ? "#00f5c4" : "#333",
                color: m.senderId === myId ? "#000" : "#fff",
                padding: "10px 14px",
                borderRadius: 12,
                maxWidth: "60%",
                whiteSpace: "normal",
                lineHeight: 1.45,
                wordBreak: "break-word",
              }}
            >
              {renderMessageContent(m.content)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div
        style={{
          marginTop: 20,
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <textarea
            ref={textareaRef}
            className="input"
            placeholder="Scrivi un messaggio…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={1}
            style={{
              width: "100%",
              minHeight: 52,
              maxHeight: 180,
              resize: "none",
              overflowY: "auto",
              paddingTop: 14,
              paddingBottom: 14,
              lineHeight: 1.45,
              borderRadius: 14,
            }}
          />
        </div>

        <button
          className="btn"
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          style={{ minWidth: 92, height: 52 }}
        >
          {sending ? "Invio..." : "Invia"}
        </button>
      </div>

      {deletePromptOpen && (
        <div className="ascari-modal" onClick={() => setDeletePromptOpen(false)}>
          <div className="ascari-modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Chat</h3>
            <p className="muted">{deletePromptText}</p>

            <button
              className="btn"
              style={{ marginTop: 18, width: "100%" }}
              onClick={deleteChat}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Eliminazione..." : "Elimina chat"}
            </button>

            <button
              className="btn ghost"
              style={{ marginTop: 10, width: "100%" }}
              onClick={() => setDeletePromptOpen(false)}
              disabled={deleteBusy}
            >
              Non ora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}