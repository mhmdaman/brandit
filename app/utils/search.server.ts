import { Prisma, Medium, Track, Platform } from "@prisma/client";
import { prisma } from "~/db.server";

export const PAGE_SIZE = 24;

export interface SearchParams {
  q: string;
  medium?: Medium;
  track?: Track;
  year?: number;
  country?: string;
  platform?: Platform;
  tag?: string;
  sort: "relevance" | "newest" | "oldest";
  page: number;
}

export interface SearchResultAd {
  id: string;
  title: string;
  description: string | null;
  url: string;
  platform: Platform;
  externalId: string | null;
  imageUrl: string | null;
  medium: Medium;
  track: Track;
  year: number;
  country: string;
  school: string | null;
  course: string | null;
  status: string;
  featuredAt: Date | null;
  createdAt: Date;
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
  };
  tags: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
}

export interface FilterChip {
  key: string;
  label: string;
  removeUrl: string;
}

export function parseSearchParams(url: URL, defaultTrack?: Track): SearchParams {
  const searchParams = url.searchParams;

  // 1. Query: max 100 chars, collapse whitespace
  const rawQ = searchParams.get("q") || "";
  const q = rawQ.replace(/\s+/g, " ").trim().slice(0, 100);

  // 2. Medium
  const rawMedium = searchParams.get("medium")?.toUpperCase();
  const medium = Object.values(Medium).includes(rawMedium as Medium)
    ? (rawMedium as Medium)
    : undefined;

  // 3. Track (can be preset e.g. for /professional or /student)
  const rawTrack = (searchParams.get("track")?.toUpperCase() || defaultTrack) as Track | undefined;
  const track = Object.values(Track).includes(rawTrack as Track)
    ? (rawTrack as Track)
    : undefined;

  // 4. Year: integer between 1900 and next year
  const currentYear = new Date().getFullYear();
  const rawYear = parseInt(searchParams.get("year") || "", 10);
  const year = !isNaN(rawYear) && rawYear >= 1900 && rawYear <= currentYear + 1
    ? rawYear
    : undefined;

  // 5. Country
  const rawCountry = searchParams.get("country")?.trim();
  const country = rawCountry && rawCountry.length <= 100 ? rawCountry : undefined;

  // 6. Platform
  const rawPlatform = searchParams.get("platform")?.toUpperCase();
  const platform = Object.values(Platform).includes(rawPlatform as Platform)
    ? (rawPlatform as Platform)
    : undefined;

  // 7. Tag
  const rawTag = searchParams.get("tag")?.trim();
  const tag = rawTag && rawTag.length <= 50 ? rawTag : undefined;

  // 8. Sort: relevance | newest | oldest
  const rawSort = searchParams.get("sort")?.toLowerCase();
  let sort: "relevance" | "newest" | "oldest";
  if (rawSort === "newest" || rawSort === "oldest") {
    sort = rawSort;
  } else if (rawSort === "relevance" && q) {
    sort = "relevance";
  } else {
    sort = q ? "relevance" : "newest";
  }

  // 9. Page
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = !isNaN(rawPage) && rawPage >= 1 ? rawPage : 1;

  return {
    q,
    medium,
    track,
    year,
    country,
    platform,
    tag,
    sort,
    page,
  };
}

export async function searchAds(params: SearchParams) {
  const { q, medium, track, year, country, platform, tag, sort, page } = params;
  const offset = (page - 1) * PAGE_SIZE;

  // Build WHERE conditions safely via Prisma.sql
  const whereConditions: Prisma.Sql[] = [Prisma.sql`a.status = 'APPROVED'`];

  if (q) {
    whereConditions.push(Prisma.sql`(
      to_tsvector('simple', a.title || ' ' || coalesce(a.description, '') || ' ' || b.name || ' ' || o.name || ' ' || coalesce(tag_agg.tag_names, '')) @@ websearch_to_tsquery('simple', ${q})
      OR a.title % ${q}
      OR b.name % ${q}
      OR o.name % ${q}
      OR coalesce(tag_agg.tag_names, '') % ${q}
      OR similarity(a.title, ${q}) > 0.2
      OR similarity(b.name, ${q}) > 0.25
      OR similarity(o.name, ${q}) > 0.25
    )`);
  }

  if (medium) {
    whereConditions.push(Prisma.sql`a.medium = ${medium}::"Medium"`);
  }

  if (track) {
    whereConditions.push(Prisma.sql`a.track = ${track}::"Track"`);
  }

  if (year !== undefined) {
    whereConditions.push(Prisma.sql`a.year = ${year}`);
  }

  if (country) {
    whereConditions.push(Prisma.sql`LOWER(a.country) = LOWER(${country})`);
  }

  if (platform) {
    whereConditions.push(Prisma.sql`a.platform = ${platform}::"Platform"`);
  }

  if (tag) {
    whereConditions.push(Prisma.sql`(
      EXISTS (
        SELECT 1 FROM "_AdToTag" _att
        JOIN "Tag" _t ON _att."B" = _t.id
        WHERE _att."A" = a.id
          AND (LOWER(_t.slug) = LOWER(${tag}) OR LOWER(_t.name) = LOWER(${tag}))
      )
    )`);
  }

  const whereClause = Prisma.join(whereConditions, " AND ");

  // Order Clause
  let orderClause: Prisma.Sql;
  if (sort === "relevance" && q) {
    orderClause = Prisma.sql`score DESC, a."featuredAt" DESC NULLS LAST, a."createdAt" DESC`;
  } else if (sort === "oldest") {
    orderClause = Prisma.sql`a."createdAt" ASC`;
  } else {
    orderClause = Prisma.sql`a."featuredAt" DESC NULLS LAST, a."createdAt" DESC`;
  }

  // Score expression for ranking
  const scoreExpr = q
    ? Prisma.sql`(
        ts_rank(to_tsvector('simple', a.title || ' ' || coalesce(a.description, '') || ' ' || b.name || ' ' || o.name || ' ' || coalesce(tag_agg.tag_names, '')), websearch_to_tsquery('simple', ${q})) * 2.0
        + similarity(a.title, ${q}) * 3.0
        + similarity(b.name, ${q}) * 2.5
        + similarity(o.name, ${q}) * 2.0
      )`
    : Prisma.sql`0`;

  const dataQuery = Prisma.sql`
    WITH tag_agg AS (
      SELECT at."A" AS "adId",
             string_agg(t.name, ' ') AS tag_names,
             string_agg(t.slug, ' ') AS tag_slugs,
             json_agg(json_build_object('id', t.id, 'name', t.name, 'slug', t.slug)) AS tags_json
      FROM "_AdToTag" at
      JOIN "Tag" t ON at."B" = t.id
      GROUP BY at."A"
    )
    SELECT
      a.id,
      a.title,
      a.description,
      a.url,
      a.platform,
      a."externalId",
      a."imageUrl",
      a.medium,
      a.track,
      a.year,
      a.country,
      a.school,
      a.course,
      a.status,
      a."featuredAt",
      a."createdAt",
      b.id AS "brandId",
      b.name AS "brandName",
      b.slug AS "brandSlug",
      o.id AS "orgId",
      o.name AS "orgName",
      o.slug AS "orgSlug",
      o.verified AS "orgVerified",
      coalesce(tag_agg.tags_json, '[]'::json) AS "tagsJson",
      ${scoreExpr} AS score
    FROM "Ad" a
    JOIN "Brand" b ON a."brandId" = b.id
    JOIN "Organization" o ON a."orgId" = o.id
    LEFT JOIN tag_agg ON a.id = tag_agg."adId"
    WHERE ${whereClause}
    ORDER BY ${orderClause}
    LIMIT ${PAGE_SIZE} OFFSET ${offset};
  `;

  const countQuery = Prisma.sql`
    WITH tag_agg AS (
      SELECT at."A" AS "adId",
             string_agg(t.name, ' ') AS tag_names,
             string_agg(t.slug, ' ') AS tag_slugs
      FROM "_AdToTag" at
      JOIN "Tag" t ON at."B" = t.id
      GROUP BY at."A"
    )
    SELECT COUNT(DISTINCT a.id)::int AS count
    FROM "Ad" a
    JOIN "Brand" b ON a."brandId" = b.id
    JOIN "Organization" o ON a."orgId" = o.id
    LEFT JOIN tag_agg ON a.id = tag_agg."adId"
    WHERE ${whereClause};
  `;

  const [rawRows, countRows] = await Promise.all([
    prisma.$queryRaw<Array<any>>(dataQuery),
    prisma.$queryRaw<Array<{ count: number }>>(countQuery),
  ]);

  const totalCount = countRows[0]?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;

  const ads: SearchResultAd[] = rawRows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    url: row.url,
    platform: row.platform as Platform,
    externalId: row.externalId,
    imageUrl: row.imageUrl,
    medium: row.medium as Medium,
    track: row.track as Track,
    year: row.year,
    country: row.country,
    school: row.school,
    course: row.course,
    status: row.status,
    featuredAt: row.featuredAt ? new Date(row.featuredAt) : null,
    createdAt: new Date(row.createdAt),
    brand: {
      id: row.brandId,
      name: row.brandName,
      slug: row.brandSlug,
    },
    org: {
      id: row.orgId,
      name: row.orgName,
      slug: row.orgSlug,
      verified: Boolean(row.orgVerified),
    },
    tags: Array.isArray(row.tagsJson) ? row.tagsJson : [],
  }));

  return {
    ads,
    totalCount,
    totalPages,
    currentPage: page,
  };
}

export function buildFilterChips(
  url: URL,
  params: SearchParams,
  lockedKeys: string[] = []
): FilterChip[] {
  const chips: FilterChip[] = [];

  const addChip = (key: string, label: string) => {
    if (lockedKeys.includes(key)) return;
    const nextUrl = new URL(url.pathname, url.origin);
    // Copy all params except this key and reset page to 1
    url.searchParams.forEach((val, k) => {
      if (k !== key && k !== "page") {
        nextUrl.searchParams.set(k, val);
      }
    });
    chips.push({
      key,
      label,
      removeUrl: `${nextUrl.pathname}${nextUrl.search}`,
    });
  };

  if (params.q) {
    addChip("q", `"${params.q}"`);
  }
  if (params.medium) {
    addChip("medium", `Medium: ${params.medium.toLowerCase()}`);
  }
  if (params.track) {
    addChip("track", `Track: ${params.track.toLowerCase()}`);
  }
  if (params.year) {
    addChip("year", `Year: ${params.year}`);
  }
  if (params.country) {
    addChip("country", `Country: ${params.country}`);
  }
  if (params.platform) {
    addChip("platform", `Platform: ${params.platform.toLowerCase()}`);
  }
  if (params.tag) {
    addChip("tag", `Tag: ${params.tag}`);
  }

  return chips;
}

export function buildPaginationUrl(url: URL, targetPage: number): string {
  const nextUrl = new URL(url.pathname, url.origin);
  url.searchParams.forEach((val, k) => {
    if (k !== "page") {
      nextUrl.searchParams.set(k, val);
    }
  });
  if (targetPage > 1) {
    nextUrl.searchParams.set("page", targetPage.toString());
  }
  return `${nextUrl.pathname}${nextUrl.search}`;
}

export async function getSearchFilterOptions() {
  const [yearsResult, countriesResult, tagsResult] = await Promise.all([
    prisma.ad.findMany({
      where: { status: "APPROVED" },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    prisma.ad.findMany({
      where: { status: "APPROVED" },
      distinct: ["country"],
      select: { country: true },
      orderBy: { country: "asc" },
    }),
    prisma.tag.findMany({
      where: {
        ads: {
          some: { status: "APPROVED" },
        },
      },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    years: yearsResult.map((r) => r.year),
    countries: countriesResult.map((r) => r.country).filter(Boolean),
    tags: tagsResult,
  };
}

