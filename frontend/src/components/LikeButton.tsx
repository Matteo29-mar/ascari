import React, { useState, useEffect } from "react";
import { likeCar, unlikeCar } from "../api";
import { useAuth } from "@clerk/clerk-react";

type Props = {
  carId: number;
  initialLiked: boolean;
  disabled?: boolean;

  // 🟢 AGGIUNTO: callback al parent
  onChange?: (liked: boolean) => void;
};

export default function LikeButton({
  carId,
  initialLiked,
  disabled = false,
  onChange,
}: Props) {
  const { getToken } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [anim, setAnim] = useState(false);

  // 🟢 Se initialLiked cambia (dopo una fetch), aggiorna lo stato locale
  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked]);

  async function toggle() {
    if (disabled) return;
    const token = await getToken();

    try {
      let newVal = !liked;
      setLiked(newVal);

      // 🔥 NOTIFICA IL PARENT (carList)
      onChange?.(newVal);

      if (newVal) {
        await likeCar(carId, token!);
      } else {
        await unlikeCar(carId, token!);
      }

      // animazione
      setAnim(true);
      setTimeout(() => setAnim(false), 300);

    } catch (err) {
      console.error("Like error", err);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`like-button ${anim ? "like-anim" : ""}`}
      style={{
        fontSize: "1.6rem",
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span>{liked ? "❤️" : "🤍"}</span>

      <style>{`
        .like-anim {
          transform: scale(1.3);
          transition: transform 0.2s ease;
        }
        .like-button {
          transition: transform 0.2s ease;
        }
      `}</style>
    </button>
  );
}
