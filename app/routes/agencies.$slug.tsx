import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";
import { AdCard } from "~/components/AdCard";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.agency) {
    return [{ title: "Agency Not Found — Brandit" }];
  }
  return [
    { title: `${data.agency.name} — Agency Campaigns | Brandit` },
    {
      name: "description",
      content:
        data.agency.bio ||
        `Discover award-winning campaigns and commercial advertising created by ${data.agency.name}.`,
    },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const { slug } = params;

  if (!slug) {
    throw new Response("Not found", { status: 404 });
  }

  const agency = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      bio: true,
      country: true,
      website: true,
      logoUrl: true,
      verified: true,
    },
  });

  if (!agency) {
    throw new Response("Not found", { status: 404 });
  }

  const ads = await prisma.ad.findMany({
    where: {
      orgId: agency.id,
      status: "APPROVED",
    },
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

  return json({ agency, ads });
}

export default function AgencyDetail() {
  const { agency, ads } = useLoaderData<typeof loader>();

  return (
    <div id={`agency-detail-${agency.slug}`}>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumbs-sep">/</span>
        <span>Agencies</span>
        <span className="breadcrumbs-sep">/</span>
        <span aria-current="page">{agency.name}</span>
      </nav>

      {/* Agency Profile Hero */}
      <section className="profile-hero">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 className="page-title">{agency.name}</h1>
          {agency.verified && (
            <span className="badge-verified" title="Verified Creator/Agency">
              ✓ Verified
            </span>
          )}
        </div>
        {agency.bio && <p className="page-subtitle">{agency.bio}</p>}

        <div className="profile-meta-row">
          {agency.country && (
            <div className="profile-meta-item">
              Location: <strong>{agency.country}</strong>
            </div>
          )}
          <div className="profile-meta-item">
            Total Campaigns: <strong>{ads.length}</strong>
          </div>
          {agency.website && (
            <div className="profile-meta-item">
              <a
                href={agency.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Agency Website ↗
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Agency Campaigns Grid */}
      <section aria-label={`${agency.name} campaigns`}>
        <div className="section-title-wrap">
          <h2 className="section-title">Campaigns by {agency.name}</h2>
          <span className="section-count">{ads.length} total</span>
        </div>

        {ads.length > 0 ? (
          <div className="ads-grid">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No campaigns found for {agency.name}</h3>
            <p>New campaigns created by this agency will appear here once approved.</p>
          </div>
        )}
      </section>
    </div>
  );
}
