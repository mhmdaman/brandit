import { Link } from "@remix-run/react";

export interface AdCardProps {
  ad: {
    id: string;
    title: string;
    platform: string;
    externalId: string | null;
    imageUrl: string | null;
    featuredAt?: string | Date | null;
    brand: {
      name: string;
      slug: string;
    };
    org: {
      name: string;
      slug: string;
    };
  };
}

export function AdCard({ ad }: AdCardProps) {
  // Determine thumbnail URL
  let thumbnailUrl: string | null = null;
  if (ad.platform === "YOUTUBE" && ad.externalId) {
    thumbnailUrl = `https://i.ytimg.com/vi/${ad.externalId}/hqdefault.jpg`;
  } else if (ad.imageUrl) {
    thumbnailUrl = ad.imageUrl;
  }

  return (
    <article className="ad-card" id={`ad-card-${ad.id}`}>
      <Link to={`/ads/${ad.id}`} className="ad-card-thumb-wrap" tabIndex={-1} aria-hidden="true">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={ad.title}
            className="ad-card-thumb"
            loading="lazy"
          />
        ) : (
          <div className="thumb-placeholder">{ad.brand.name}</div>
        )}

        {ad.featuredAt && (
          <span className="badge-featured" title="Featured Campaign">
            ★ Featured
          </span>
        )}

        <span className="badge-platform">{ad.platform}</span>
      </Link>

      <div className="ad-card-body">
        <h3 className="ad-card-title">
          <Link to={`/ads/${ad.id}`}>{ad.title}</Link>
        </h3>

        <div className="ad-card-meta">
          <div className="ad-card-brand-row">
            <Link to={`/brands/${ad.brand.slug}`} className="ad-card-brand">
              {ad.brand.name}
            </Link>
          </div>
          <div className="ad-card-agency">
            <span>By</span>
            <Link to={`/agencies/${ad.org.slug}`}>{ad.org.name}</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
