import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";

  if (!q) {
    return json({ brands: [] });
  }

  const brands = await prisma.brand.findMany({
    where: {
      name: {
        contains: q,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
    take: 8,
    orderBy: {
      name: "asc",
    },
  });

  return json({ brands });
}

