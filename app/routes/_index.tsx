import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";
import { AdCard } from "~/components/AdCard";
import { Pagination } from "~/components/Pagination";

export const meta: MetaFunction = () => {
  return [
    { title: "Brandit — Curated Ad Campaigns & Agencies" },
    {
      name: "description",
      content:
        "Explore a public gallery of world-class advertising campaigns, organized by brand and the creative agencies that produced them.",
    },
  ];
};

const PAGE_SIZE = 24;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  // 1. Highlighted ads: approved ads with featuredAt not null, newest first
  const highlightedAds = await prisma.ad.findMany({
    where: {
      status: "APPROVED",
      featuredAt: { not: null },
    },
    orderBy: { featuredAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      platform: true,
      externalId: true,
      imageUrl: true,
      featuredAt: true,
      brand: {
        select: {
          name: true,
          slug: true,
        },
      },
      org: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  // 2. Latest ads: approved ads paginated by 24 per page
  const totalApprovedAds = await prisma.ad.count({
    where: { status: "APPROVED" },
  });

  const latestAds = await prisma.ad.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      platform: true,
      externalId: true,
      imageUrl: true,
      featuredAt: true,
      brand: {
        select: {
          name: true,
          slug: true,
        },
      },
      org: {
        select: {
          name: true,
          slug: true,
        },
      },
    },
  });

  const totalPages = Math.ceil(totalApprovedAds / PAGE_SIZE);

  return json({
    highlightedAds,
    latestAds,
    currentPage: page,
    totalPages,
    totalApprovedAds,
  });
}

export default function Index() {
  const { highlightedAds, latestAds, currentPage, totalPages, totalApprovedAds } =
    useLoaderData<typeof loader>();

  return (
    <div>
      <section className="page-header">
        <h1 className="page-title">Advertising Campaign Library</h1>
        <p className="page-subtitle">
          Discover celebrated advertising work across the world's most iconic brands and creative agencies.
        </p>
      </section>

      {/* Highlighted Row (only on page 1) */}
      {currentPage === 1 && highlightedAds.length > 0 && (
        <section className="highlighted-section" aria-labelledby="highlighted-heading">
          <div className="section-title-wrap">
            <h2 id="highlighted-heading" className="section-title">
              ★ Highlighted Campaigns
            </h2>
            <span className="section-count">{highlightedAds.length} curated</span>
          </div>
          <div className="highlighted-grid">
            {highlightedAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        </section>
      )}

      {/* Latest Grid */}
      <section aria-labelledby="latest-heading">
        <div className="section-title-wrap">
          <h2 id="latest-heading" className="section-title">
            Latest Campaigns
          </h2>
          <span className="section-count">{totalApprovedAds} total campaigns</span>
        </div>

        {latestAds.length > 0 ? (
          <div className="ads-grid">
            {latestAds.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No campaigns found</h3>
            <p>Check back soon as new campaigns are added to the library.</p>
          </div>
        )}

        <Pagination currentPage={currentPage} totalPages={totalPages} />
      </section>
    </div>
  );
}
