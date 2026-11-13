import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/db.server";
import { checkSuggestRateLimit, createRateLimitResponse, getClientIp } from "~/utils/rateLimit.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const ip = getClientIp(request);
  if (checkSuggestRateLimit(ip)) {
    return createRateLimitResponse("Too many search requests. Please slow down.");
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);

  if (q.length < 2) {
    return json({ brands: [], agencies: [], ads: [] });
  }

  const [brands, agencies, ads] = await Promise.all([
    prisma.brand.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
        ads: { some: { status: "APPROVED" } },
      },
      take: 6,
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
        ],
        ads: { some: { status: "APPROVED" } },
      },
      take: 4,
      select: { id: true, name: true, slug: true, verified: true },
      orderBy: { name: "asc" },
    }),
    prisma.ad.findMany({
      where: {
        status: "APPROVED",
        title: { contains: q, mode: "insensitive" },
      },
      take: 4,
      select: {
        id: true,
        title: true,
        brand: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return json(
    { brands, agencies, ads },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
  );
}

