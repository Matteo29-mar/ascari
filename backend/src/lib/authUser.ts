// backend/src/lib/authUser.ts
import { prisma } from '../prisma';
import type { User } from '@prisma/client';

/**
 * Garantisce che l'utente esista nel DB.
 * - Se trova per clerkId -> ritorna quello
 * - Se non trova ma c'è un utente con la stessa email -> aggiorna clerkId e (opzionalmente) il name e ritorna quello
 * - Se non trova niente -> crea un nuovo utente con email "safe" (per non rompere la UNIQUE)
 */
export async function ensureUserInDb(
  clerkUserId: string,
  email?: string | null,
  name?: string | null
): Promise<User> {
  if (!clerkUserId) {
    throw new Error('ensureUserInDb called without clerkUserId');
  }

  // 1. Cerco per clerkId
  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (user) {
    return user;
  }

  // 2. Se non esiste ancora e ho l'email, provo a cercare per email
  if (email) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingByEmail) {
      // aggiorno il clerkId (e opzionalmente il nome)
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          clerkId: clerkUserId,
          ...(name ? { name } : {}),
        },
      });

      return user;
    }
  }

  // 3. Creo un nuovo utente con email sicura (unica)
  const safeEmail = email ?? `no-email-${clerkUserId}@ascari.local`;

  user = await prisma.user.create({
    data: {
      clerkId: clerkUserId,
      email: safeEmail,
      name: name ?? undefined,
    },
  });

  return user;
}
