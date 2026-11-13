import { prisma } from "~/db.server";

/**
 * Fetches the set of bookmarked ad IDs for a specific user out of a provided list of ad IDs.
 * Returns an empty set immediately for unauthenticated users, avoiding any query overhead.
 */
export async function getUserBookmarkedSet(
  userId: string | null | undefined,
  adIds: string[]
): Promise<Set<string>> {
  if (!userId || adIds.length === 0) {
    return new Set<string>();
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: {
      userId,
      adId: { in: adIds },
    },
    select: { adId: true },
  });

  return new Set(bookmarks.map((b) => b.adId));
}

/**
 * Idempotently adds or removes a bookmark for a user.
 */
export async function toggleBookmark(
  userId: string,
  adId: string,
  intent: "add" | "remove"
): Promise<{ bookmarked: boolean }> {
  if (intent === "add") {
    await prisma.bookmark.upsert({
      where: {
        userId_adId: {
          userId,
          adId,
        },
      },
      update: {},
      create: {
        userId,
        adId,
      },
    });
    return { bookmarked: true };
  } else {
    await prisma.bookmark.deleteMany({
      where: {
        userId,
        adId,
      },
    });
    return { bookmarked: false };
  }
}

