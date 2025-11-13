// backend/src/lib/authUser.ts
import { prisma } from '../prisma';

export async function ensureUserInDb(
  clerkUserId: string,
  email?: string | null,
  name?: string | null
) {
  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: clerkUserId,
        email: email ?? '',
        name: name ?? undefined,
      },
    });
  }

  return user;
}
