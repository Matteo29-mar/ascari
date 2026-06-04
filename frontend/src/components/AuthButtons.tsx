// frontend/src/components/AuthButtons.tsx
import React from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { useRole } from "../hooks/useRole";

export function AuthButtons() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { role } = useRole();

  const isInspector = role === "PERIZIATORE";

  return (
    <div
      className="flex items-center space-x-4"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <SignedOut>
        <SignInButton mode="modal">
          <button
            className="btn"
            type="button"
            style={{
              minWidth: 110,
            }}
          >
            Accedi
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                userButtonAvatarBox: "w-8 h-8 rounded-full",
                userButtonPopoverCard: {
                  boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                },
              },
            }}
          >
            <UserButton.MenuItems>
              <UserButton.Action
                label="Area pagamenti"
                labelIcon={<span style={{ fontSize: 16 }}>🏦</span>}
                onClick={() => navigate(isInspector ? "/inspector/payments" : "/payments")}
              />

              {!isInspector && (
                <UserButton.Action
                  label="Storico"
                  labelIcon={<span style={{ fontSize: 16 }}>📜</span>}
                  onClick={() => navigate("/history")}
                />
              )}
            </UserButton.MenuItems>
          </UserButton>

          <span
            style={{
              color: "var(--text)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {user?.firstName ?? user?.fullName ?? "Utente"}
          </span>
        </div>
      </SignedIn>
    </div>
  );
}
