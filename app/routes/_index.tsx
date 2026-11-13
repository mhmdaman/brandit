import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";
import { Platform } from "@prisma/client";
import { AdCard } from "~/components/AdCard";
import { Pagination } from "~/components/Pagination";

export const meta: MetaFunction = () => {
  return [
    { title: "Brandit — The Art of Advertising" },
    {
      name: "description",
      content:
        "Discover the creativity behind campaigns that captured the world's attention.",
    },
  ];
};

const PAGE_SIZE = 24;

// Shared select fields for ad cards
const adCardSelect = {
  id: true,
  title: true,
  platform: true,
  externalId: true,
  imageUrl: true,
  featuredAt: true,
  brand: { select: { name: true, slug: true } },
  org: { select: { name: true, slug: true } },
} as const;

// Only ads that will render an image thumbnail (no blank placeholders)
const hasImageOR = [
  { platform: Platform.YOUTUBE, externalId: { not: null } },
  { imageUrl: { not: null } },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const baseWhere = { status: "APPROVED" as const, OR: hasImageOR };

  const [highlightedAds, totalApprovedAds, latestAds] = await Promise.all([
    prisma.ad.findMany({
      where: { ...baseWhere, featuredAt: { not: null } },
      orderBy: { featuredAt: "desc" },
      take: 6,
      select: adCardSelect,
    }),
    prisma.ad.count({ where: baseWhere }),
    prisma.ad.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: adCardSelect,
    }),
  ]);

  const totalPages = Math.ceil(totalApprovedAds / PAGE_SIZE);

  return json({ highlightedAds, latestAds, currentPage: page, totalPages, totalApprovedAds });
}

export default function Index() {
  const { highlightedAds, latestAds, currentPage, totalPages, totalApprovedAds } =
    useLoaderData<typeof loader>();

  return (
    <div className="home-wrapper">
      {/* ── Hero ── */}
      {currentPage === 1 && (
        <section className="hero-section" aria-label="Hero">
          {/* Spotlight overlay — rendered as a CSS layer, not SVG */}
          <div className="hero-spotlight" aria-hidden="true" />

          <div className="hero-content">
            <div className="hero-line" aria-hidden="true" />
            <h1 className="hero-title">
              The Art of
              <br />
              <span className="hero-title-dim">Advertising.</span>
            </h1>
            <p className="hero-subtitle">
              Discover the creativity behind campaigns that
              <br />
              captured the world's attention.
            </p>

            <Form method="get" action="/brands" className="hero-search-form">
              <div className="hero-search-wrap">
                <svg
                  className="hero-search-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="5.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M13 13l3.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  type="text"
                  name="q"
                  placeholder="Search campaigns..."
                  className="hero-search-input"
                  aria-label="Search campaigns"
                  autoComplete="off"
                />
              </div>
            </Form>
          </div>

          {/* ── Clapperboard photo ── */}
          <div className="hero-visual" aria-hidden="true">
            <img
              src="/images/clapperboard-hero.png"
              alt=""
              className="hero-clapperboard-img"
              draggable={false}
            />
          </div>
        </section>
      )}

      {/* ── Main content below hero ── */}
      <div className="home-content">
        {/* Highlighted Campaigns */}
        {currentPage === 1 && highlightedAds.length > 0 && (
          <section
            className="highlighted-section"
            aria-labelledby="highlighted-heading"
          >
            <div className="section-title-wrap">
              <h2 id="highlighted-heading" className="section-title">
                <span className="section-star" aria-hidden="true">★</span>
                Highlighted Campaigns
              </h2>
              <Link to="/brands" className="view-all-link">
                View all →
              </Link>
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
          {currentPage === 1 && (
            <div className="section-title-wrap">
              <h2 id="latest-heading" className="section-title">
                Latest Campaigns
              </h2>
              <span className="section-count">{totalApprovedAds} total</span>
            </div>
          )}

          {latestAds.length > 0 ? (
            <div className="ads-grid">
              {latestAds.map((ad) => (
                <AdCard key={ad.id} ad={ad} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No campaigns yet</h3>
              <p>
                Check back soon as new campaigns are added to the library.
              </p>
            </div>
          )}

          <Pagination currentPage={currentPage} totalPages={totalPages} />
        </section>
      </div>
    </div>
  );
}
