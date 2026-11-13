import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useLocation } from "@remix-run/react";
import { Track } from "@prisma/client";
import { AdCard } from "~/components/AdCard";
import { FilterChipsBar, FilterForm, SearchPagination } from "~/components/FilterControls";
import { getUser } from "~/session.server";
import { getUserBookmarkedSet } from "~/utils/bookmarks.server";
import {
  buildFilterChips,
  getSearchFilterOptions,
  parseSearchParams,
  searchAds,
} from "~/utils/search.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Student Work & Spec Commercials — Brandit" },
    {
      name: "description",
      content: "Discover inspiring student advertising spec campaigns, grad projects, and portfolio concepts.",
    },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const user = await getUser(request);
  const params = parseSearchParams(url, Track.STUDENT);

  const [{ ads, totalCount, totalPages, currentPage }, options] = await Promise.all([
    searchAds(params),
    getSearchFilterOptions(),
  ]);

  const adIds = ads.map((a) => a.id);
  const bookmarkedSet = await getUserBookmarkedSet(user?.id, adIds);
  const bookmarkedIds = Array.from(bookmarkedSet);

  // Lock "track" from being removed via chips
  const chips = buildFilterChips(url, params, ["track"]);

  return json({
    ads,
    totalCount,
    totalPages,
    currentPage,
    params,
    options,
    chips,
    bookmarkedIds,
    isLoggedIn: Boolean(user),
  });
}

export default function StudentPage() {
  const { ads, totalCount, totalPages, currentPage, params, options, chips, bookmarkedIds, isLoggedIn } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  const currentUrl = new URL(`${location.pathname}${location.search}`, "http://localhost");

  return (
    <div className="track-feed-container">
      <header className="page-header">
        <h1 className="page-title">Student &amp; Spec Work</h1>
        <p className="page-subtitle">
          Creative spec commercials, experimental campaigns, and portfolio projects produced by students worldwide.
        </p>
      </header>

      {/* Filter Form with Track selector hidden */}
      <FilterForm
        params={params}
        actionUrl="/student"
        options={options}
        hideTrackSelect={true}
        showSearchInput={true}
      />

      {/* Filter Chips */}
      <FilterChipsBar chips={chips} clearAllUrl="/student" />

      {/* Results Grid */}
      <section className="search-results-section" aria-label="Student campaigns">
        <div className="section-title-wrap">
          <h2 className="section-title">
            <span>Student Projects</span>
          </h2>
          <span className="section-count">{totalCount.toLocaleString()} total</span>
        </div>

        {ads.length > 0 ? (
          <div className="ads-grid">
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                isBookmarked={bookmarkedIds.includes(ad.id)}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No student campaigns found</h3>
            <p>Try clearing filters or check back soon.</p>
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

