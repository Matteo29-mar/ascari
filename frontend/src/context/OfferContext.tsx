import React, { createContext, useContext, useState, useEffect } from "react";
import { http } from "../api";
import { useAuth } from "@clerk/clerk-react";

type OfferContextType = {
  pendingCount: number;
  reloadOffers: () => void;
};

const OfferContext = createContext<OfferContextType>({
  pendingCount: 0,
  reloadOffers: () => {},
});

// ✅ normalizza: backend può restituire [] oppure {offers:[]} oppure {data:[]}
function normalizeOffers(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.offers)) return payload.offers;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

export function OfferProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  async function reloadOffers() {
    if (!isSignedIn) {
      setPendingCount(0);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setPendingCount(0);
        return;
      }

      const res = await http.get("/offers/received", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const offers = normalizeOffers(res.data);
      const pending = offers.filter((o: any) => o?.status === "PENDING").length;

      setPendingCount(pending);
    } catch (err) {
      console.error("Errore notifiche offerte:", err);
      setPendingCount(0); // ✅ evita stato rotto
    }
  }

  useEffect(() => {
    reloadOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  return (
    <OfferContext.Provider value={{ pendingCount, reloadOffers }}>
      {children}
    </OfferContext.Provider>
  );
}

export function useOffers() {
  return useContext(OfferContext);
}
