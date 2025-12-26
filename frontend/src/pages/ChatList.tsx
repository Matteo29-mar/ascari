import React, { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { http } from "../api";
import { Link } from "react-router-dom";

export default function ChatList() {
  const { getToken } = useAuth();
  const [chats, setChats] = useState<any[]>([]);

  async function load() {
    const token = await getToken();
    const { data } = await http.get("/chat", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setChats(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h1>Chat attive</h1>

      {chats.map((c) => {
        const lastMsg = c.messages[0];

        return (
          <Link
            to={`/chat/${c.id}`}
            key={c.id}
            className="chat-row"
          >
            {/* FOTO AUTO */}
            <img
              src={c.offer?.car?.coverUrl}
              alt=""
              className="chat-avatar"
            />

            {/* INFO */}
            <div className="chat-info">
              <strong>{c.offer?.car?.title || "Auto"}</strong>
              <p>
                {lastMsg?.content || "Nessun messaggio"}
              </p>
            </div>

            {/* STATO */}
            <div className="chat-meta">
              {!lastMsg?.readAt && (
                <span className="dot" />
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
