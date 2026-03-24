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

export default function ChatPage() {
  const { id } = useParams(); // chatId (string)
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
  const bottomRef = useRef<HTMLDivElement>(null);

  // ✅ popup eliminazione (solo venditore, solo per perizia cancellata)
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

  async function authHeaders() {
    const token = await getToken();
    if (!token) throw new Error("Token mancante");
    return { Authorization: `Bearer ${token}` };
  }

  async function loadChat() {
    if (!chatId) return;

    try {
      const headers = await authHeaders();
      const { data } = await http.get(`/chat/${chatId}`, { headers });

      setChatInfo(data);
      setMessages(data.messages || []);

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

      // ✅ popup: perizia cancellata visibile al venditore
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
      const msg = e?.response?.data?.error ?? e?.message ?? "Errore caricamento chat";
      alert(msg);

      if (status === 403 || status === 404 || status === 400) {
        goBack();
      }
    }
  }

  // ✅ se chatId invalido: niente chiamate e torna alla lista
  useEffect(() => {
    if (!chatId) {
      // evita loop: se sei già in /chat
      goBack();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // 🔄 Polling ogni 3 sec SOLO se chatId valido
  useEffect(() => {
    if (!chatId) return;

    loadChat();
    const interval = setInterval(loadChat, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  async function sendMessage() {
    if (!chatId) return;
    if (!input.trim()) return;

    try {
      const headers = await authHeaders();
      await http.post(`/chat/${chatId}/message`, { content: input }, { headers });
      setInput("");
      loadChat();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? e?.message ?? "Errore invio messaggio");
    }
  }

  async function deleteChat() {
    if (!chatId) return;

    try {
      setDeleteBusy(true);
      const headers = await authHeaders();
      await http.delete(`/chat/${chatId}`, { headers });
      setDeletePromptOpen(false);
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

  // ✅ usa buyer/seller direttamente
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
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="row" style={{ marginTop: 20, gap: 10 }}>
        <input
          className="input"
          placeholder="Scrivi un messaggio…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          style={{ flex: 1 }}
        />
        <button className="btn" onClick={sendMessage}>
          Invia
        </button>
      </div>

      {/* ✅ MODAL eliminazione chat (venditore) */}
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