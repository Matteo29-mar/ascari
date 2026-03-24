import { useUser } from "@clerk/clerk-react";

export function useRole() {
  const { user, isLoaded } = useUser();

  const role =
    (user?.unsafeMetadata?.role as string | undefined) ?? "USER";

  return { role, isLoaded };
}
