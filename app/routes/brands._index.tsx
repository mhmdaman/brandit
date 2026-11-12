import type { MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Brand Directory — Brandit" },
    {
      name: "description",
      content:
        "Alphabetical directory of leading global brands and their iconic advertising campaigns.",
    },
  ];
};

export async function loader() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      _count: {
        select: {
          ads: {
            where: { status: "APPROVED" },
          },
        },
      },
    },
  });

  return json({ brands });
}

export default function BrandsDirectory() {
  const { brands } = useLoaderData<typeof loader>();

  return (
    <div>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumbs-sep">/</span>
        <span aria-current="page">Brands</span>
      </nav>

      <section className="page-header">
        <h1 className="page-title">Brand Directory</h1>
        <p className="page-subtitle">
          Browse advertising archives by brand to discover creative work across industries.
        </p>
      </section>

      {brands.length > 0 ? (
        <div className="directory-grid">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              to={`/brands/${brand.slug}`}
              className="directory-card"
              id={`brand-card-${brand.slug}`}
            >
              <div>
                <h2 className="directory-card-name">{brand.name}</h2>
                {brand.industry && (
                  <p className="directory-card-sub">{brand.industry}</p>
                )}
              </div>
              <span className="directory-card-badge">
                {brand._count.ads} {brand._count.ads === 1 ? "ad" : "ads"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No brands available</h3>
          <p>Seeded brand directories will appear here.</p>
        </div>
      )}
    </div>
  );
}
