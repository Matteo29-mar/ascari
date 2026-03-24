// backend/src/lib/authUser.ts
import { prisma } from "../prisma";
import type { User } from "@prisma/client";
import { clerkClient } from "@clerk/express";

/**
 * Garantisce che l'utente esista nel DB e che email/nome siano REALI (da Clerk).
 *
 * Regole:
 * - Se esiste per clerkId -> aggiorna email/name (se disponibili) e ritorna
 * - Se non esiste per clerkId:
 *   - se esiste per email -> collega clerkId e aggiorna name/email
 *   - altrimenti -> crea nuovo utente con email reale (no fallback tipo ascari.local)
 */
export async function ensureUserInDb(
  clerkUserId: string,
  email?: string | null,
  name?: string | null
): Promise<User> {
  if (!clerkUserId) {
    throw new Error("ensureUserInDb called without clerkUserId");
  }

  // 0) Se email/nome non arrivano, li recupero da Clerk
  let resolvedEmail = email ?? null;
  let resolvedName = name ?? null;

  if (!resolvedEmail || resolvedName == null) {
    const cu = await clerkClient.users.getUser(clerkUserId);

    if (!resolvedEmail) {
      resolvedEmail =
        cu.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)
          ?.emailAddress ||
        cu.emailAddresses?.[0]?.emailAddress ||
        null;
    }

    if (resolvedName == null) {
      resolvedName =
        (cu.firstName || cu.lastName)
          ? `${cu.firstName ?? ""} ${cu.lastName ?? ""}`.trim()
          : (cu.username ?? null);
    }
  }

  // Per ASCARI tu vuoi email vera: niente più fake email
  if (!resolvedEmail) {
    throw new Error("Clerk user has no email");
  }

  // 1) Cerco per clerkId
  const byClerk = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (byClerk) {
    // 🔄 tengo il DB allineato a Clerk (email/nome possono cambiare)
    const needsUpdate =
      byClerk.email !== resolvedEmail ||
      (resolvedName && (byClerk.name ?? "") !== resolvedName);

    if (!needsUpdate) return byClerk;

    return await prisma.user.update({
      where: { id: byClerk.id },
      data: {
        email: resolvedEmail,
        ...(resolvedName ? { name: resolvedName } : {}),
      },
    });
  }

  // 2) Se non esiste per clerkId, cerco per email (account pre-esistente)
  const existingByEmail = await prisma.user.findUnique({
    where: { email: resolvedEmail },
  });

  if (existingByEmail) {
    return await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        clerkId: clerkUserId,
        email: resolvedEmail, // (ridondante ma ok)
        ...(resolvedName ? { name: resolvedName } : {}),
      },
    });
  }

  // 3) Creo nuovo utente (con email reale)
  return await prisma.user.create({
    data: {
      clerkId: clerkUserId,
      email: resolvedEmail,
      name: resolvedName ?? undefined,
    },
  });
}