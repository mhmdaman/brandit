import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useLocation } from "@remix-run/react";
import { AdCard } from "~/components/AdCard";
import { SearchPagination } from "~/components/FilterControls";
import { requireUser } from "~/session.server";
import { prisma } from "~/db.server";
import { PAGE_SIZE } from "~/utils/search.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Saved Campaigns — Brandit" },
    { name: "robots", content: "noindex, nofollow" },
    { name: "description", content: "Your personal collection of saved advertising campaigns." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const pageParam = parseInt(url.searchParams.get("page") || "1", 10);
  const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;

  const [bookmarks, totalCount] = await Promise.all([
    prisma.bookmark.findMany({
      where: {
        userId: user.id,
        ad: { status: "APPROVED" },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        ad: {
          select: {
            id: true,
            title: true,
            description: true,
            url: true,
            platform: true,
            externalId: true,
            imageUrl: true,
            medium: true,
            track: true,
            year: true,
            country: true,
            school: true,
            course: true,
            featuredAt: true,
            brand: { select: { id: true, name: true, slug: true } },
            org: { select: { id: true, name: true, slug: true, verified: true } },
          },
        },
      },
    }),
    prisma.bookmark.count({
      where: {
        userId: user.id,
        ad: { status: "APPROVED" },
      },
    }),
  ]);

  const ads = bookmarks.map((b) => b.ad);
  const totalPages = Math.ceil(totalCount / PAGE_SIZE) || 1;
  const bookmarkedIds = ads.map((a) => a.id);

  return json({
    ads,
    totalCount,
    totalPages,
    currentPage: page,
    bookmarkedIds,
  });
}

export default function BookmarksPage() {
  const { ads, totalCount, totalPages, currentPage, bookmarkedIds } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const currentUrl = new URL(`${location.pathname}${location.search}`, "http://localhost");

  return (
    <div className="bookmarks-page-container">
      <header className="page-header">
        <h1 className="page-title">Saved Campaigns</h1>
        <p className="page-subtitle">
          {totalCount === 1
            ? "1 saved campaign"
            : `${totalCount.toLocaleString()} saved campaigns in your library`}
        </p>
      </header>

      <section className="search-results-section" aria-label="Bookmarked campaigns">
        {ads.length > 0 ? (
          <div className="ads-grid">
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                isBookmarked={bookmarkedIds.includes(ad.id)}
                isLoggedIn={true}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No saved campaigns yet</h3>
            <p>
              Click the bookmark icon on any campaign card or ad page to save it here for quick inspiration.
            </p>
            <div style={{ marginTop: "1.5rem" }}>
              <Link to="/search" className="btn btn-primary">
                Browse Campaigns
              </Link>
            </div>
          </div>
        )}

        <SearchPagination
          currentPage={currentPage}
          totalPages={totalPages}
          url={currentUrl}
        />
      </section>
    </div>
  );
}

