import React, { useEffect, useState, useRef } from "react";
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
  const { id } = useParams();              // chatId
  const { userId, getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();


  // 🔄 Polling ogni 3 sec
  useEffect(() => {
    loadChat();
    const interval = setInterval(loadChat, 3000);
    return () => clearInterval(interval);
  }, [id]);

  async function loadChat() {
    const token = await getToken();
    const { data } = await http.get(`/chat/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    setChatInfo(data);
    setMessages(data.messages || []);

    // Autoscroll
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function sendMessage() {
  if (!input.trim()) return;

  const token = await getToken();

  await http.post(
    `/chat/${id}/message`,
    { content: input },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  setInput(""); // reset campo testo
  loadChat();   // ricarica i messaggi aggiornati
}


  if (!chatInfo) return <p>Caricamento chat…</p>;

  const myId = chatInfo.meId as string;

  const otherUser =
    chatInfo.offer.buyerId === myId
      ? chatInfo.offer.seller
      : chatInfo.offer.buyer;

  const displayName =
    otherUser.name && otherUser.name.trim() !== ""
      ? otherUser.name
      : "Utente";


  return (
    <div style={{ padding: 20 }}>
      <h2 className="h2">Chat con {displayName}</h2>
      <div className="chat-header">
        <button
          onClick={() => navigate("/chat")}
          className="btn secondary back-chat-btn"
        >
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
    </div>
  );
}
