import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import type { Prisma } from "@prisma/client";
import { prisma } from "~/db.server";
import { AdCard } from "~/components/AdCard";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.brand) {
    return [{ title: "Brand Not Found — Brandit" }];
  }
  return [
    { title: `${data.brand.name} Ads & Campaigns — Brandit` },
    {
      name: "description",
      content: `Browse the advertising campaigns produced for ${data.brand.name} by top creative agencies.`,
    },
  ];
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { slug } = params;

  if (!slug) {
    throw new Response("Not found", { status: 404 });
  }

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      website: true,
    },
  });

  if (!brand) {
    throw new Response("Not found", { status: 404 });
  }

  // Parse filter query parameters
  const url = new URL(request.url);
  const agencySlug = url.searchParams.get("agency") || undefined;
  const yearParam = url.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  // Retrieve all distinct agencies & years for this brand's approved ads
  const brandAdsMeta = await prisma.ad.findMany({
    where: {
      brandId: brand.id,
      status: "APPROVED",
    },
    select: {
      year: true,
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const agencyMap = new Map<string, { id: string; name: string; slug: string }>();
  const yearsSet = new Set<number>();

  for (const item of brandAdsMeta) {
    agencyMap.set(item.org.slug, item.org);
    yearsSet.add(item.year);
  }

  const availableAgencies = Array.from(agencyMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const availableYears = Array.from(yearsSet).sort((a, b) => b - a);

  // Build where filter
  const adWhere: Prisma.AdWhereInput = {
    brandId: brand.id,
    status: "APPROVED",
  };

  if (agencySlug) {
    adWhere.org = { slug: agencySlug };
  }

  if (year && !isNaN(year)) {
    adWhere.year = year;
  }

  const ads = await prisma.ad.findMany({
    where: adWhere,
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
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

  return json({
    brand,
    ads,
    availableAgencies,
    availableYears,
    selectedAgency: agencySlug || null,
    selectedYear: year && !isNaN(year) ? year : null,
  });
}

export default function BrandDetail() {
  const {
    brand,
    ads,
    availableAgencies,
    availableYears,
    selectedAgency,
    selectedYear,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleAgencyFilter = (agencySlug: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (agencySlug) {
      nextParams.set("agency", agencySlug);
    } else {
      nextParams.delete("agency");
    }
    setSearchParams(nextParams);
  };

  const handleYearFilter = (yearValue: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (yearValue) {
      nextParams.set("year", yearValue);
    } else {
      nextParams.delete("year");
    }
    setSearchParams(nextParams);
  };

  const hasActiveFilters = Boolean(selectedAgency || selectedYear);

  return (
    <div id={`brand-detail-${brand.slug}`}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumbs-sep">/</span>
        <Link to="/brands">Brands</Link>
        <span className="breadcrumbs-sep">/</span>
        <span aria-current="page">{brand.name}</span>
      </nav>

      <section className="profile-hero">
        <h1 className="page-title">{brand.name}</h1>
        {brand.industry && <p className="page-subtitle">{brand.industry}</p>}

        <div className="profile-meta-row">
          <div className="profile-meta-item">
            Total Campaigns: <strong>{ads.length}</strong>
          </div>
          <div className="profile-meta-item">
            Agencies Worked With: <strong>{availableAgencies.length}</strong>
          </div>
          {brand.website && (
            <div className="profile-meta-item">
              <a
                href={brand.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Website ↗
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Filter Bar: Agencies & Years */}
      <section className="filter-bar" aria-label="Campaign Filters">
        <div className="filter-group">
          <span className="filter-label">Filter by Agency:</span>
          <button
            type="button"
            className={`filter-pill ${!selectedAgency ? "active" : ""}`}
            onClick={() => handleAgencyFilter(null)}
          >
            All Agencies ({availableAgencies.length})
          </button>
          {availableAgencies.map((agency) => (
            <button
              key={agency.id}
              type="button"
              className={`filter-pill ${
                selectedAgency === agency.slug ? "active" : ""
              }`}
              onClick={() => handleAgencyFilter(agency.slug)}
            >
              {agency.name}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <label htmlFor="year-select" className="filter-label">
            Year:
          </label>
          <select
            id="year-select"
            className="filter-select"
            value={selectedYear ? String(selectedYear) : ""}
            onChange={(e) => handleYearFilter(e.target.value)}
          >
            <option value="">All Years</option>
            {availableYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                {yr}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <Link to={`/brands/${brand.slug}`} className="clear-filter-btn">
              Clear filters
            </Link>
          )}
        </div>
      </section>

      {/* Ads Grid */}
      <section aria-label={`${brand.name} campaigns`}>
        {ads.length > 0 ? (
          <div className="ads-grid">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No campaigns found for the selected filters</h3>
            <p>Try clearing your agency or year filter to see all ads.</p>
            {hasActiveFilters && (
              <Link
                to={`/brands/${brand.slug}`}
                className="btn-external-link"
                style={{ marginTop: "1rem" }}
              >
                Reset Filters
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
