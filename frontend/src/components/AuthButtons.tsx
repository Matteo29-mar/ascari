// frontend/src/components/AuthButtons.tsx
import React from "react";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { Link } from 'react-router-dom';

export function AuthButtons() {
  const { user } = useUser();

  return (
    <div className="flex items-center space-x-4">
      <SignedOut>
        <SignInButton mode="modal">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Accedi con Google
          </button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              userButtonAvatarBox: "w-8 h-8 rounded-full",
            },
          }}
        />
        <span className="text-gray-700">
          {user?.firstName ?? user?.fullName ?? "Utente"}
        </span>
        <Link to="/my-garage">Il mio garage</Link>
      </SignedIn>
    </div>
  );
}