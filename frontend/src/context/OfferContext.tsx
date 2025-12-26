import React, { createContext, useContext, useState, useEffect } from "react";
import { http } from "../api";
import { useAuth } from "@clerk/clerk-react";

type OfferContextType = {
  pendingCount: number;
  reloadOffers: () => void;
};

const OfferContext = createContext<OfferContextType>({
  pendingCount: 0,
  reloadOffers: () => {}
});

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
      const { data } = await http.get("/offers/received", {
        headers: { Authorization: `Bearer ${token}` }
      });

      const pending = data.filter((o: any) => o.status === "PENDING").length;
      setPendingCount(pending);

    } catch (err) {
      console.error("Errore notifiche offerte:", err);
    }
  }

  useEffect(() => {
    reloadOffers();
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
