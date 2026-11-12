import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { prisma } from "~/db.server";
import { AdEmbed } from "~/components/AdEmbed";
import { checkReportRateLimit, getClientIp } from "~/utils/rateLimit.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.ad) {
    return [{ title: "Campaign Not Found — Brandit" }];
  }
  return [
    { title: `${data.ad.title} — ${data.ad.brand.name} | Brandit` },
    {
      name: "description",
      content:
        data.ad.description ||
        `Watch the campaign "${data.ad.title}" for ${data.ad.brand.name}, created by ${data.ad.org.name}.`,
    },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;

  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const ad = await prisma.ad.findFirst({
    where: {
      id,
      status: "APPROVED",
    },
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
      featuredAt: true,
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
          industry: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          website: true,
          verified: true,
        },
      },
      tags: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!ad) {
    throw new Response("Not found", { status: 404 });
  }

  return json({ ad });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json({ reportError: "Method not allowed" }, { status: 405 });
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const clientIp = getClientIp(request);
  if (checkReportRateLimit(clientIp)) {
    return json(
      {
        reportError: "You have submitted too many reports recently. Please wait before submitting another.",
      },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const reason = (formData.get("reason") as string)?.trim();

  if (!reason || reason.length < 5) {
    return json(
      {
        reportError: "Please provide a detailed reason for reporting this ad (at least 5 characters).",
      },
      { status: 400 }
    );
  }

  if (reason.length > 1000) {
    return json(
      {
        reportError: "Report reason cannot exceed 1000 characters.",
      },
      { status: 400 }
    );
  }

  await prisma.report.create({
    data: {
      adId: id,
      reason,
    },
  });

  return json({ reportSuccess: true });
}

export default function AdDetail() {
  const { ad } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [showReportForm, setShowReportForm] = useState(false);

  return (
    <div id={`ad-detail-${ad.id}`}>
      {/* Breadcrumbs */}
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="breadcrumbs-sep">/</span>
        <Link to={`/brands/${ad.brand.slug}`}>{ad.brand.name}</Link>
        <span className="breadcrumbs-sep">/</span>
        <span aria-current="page">{ad.title}</span>
      </nav>

      <div className="ad-detail-layout">
        {/* Main Column: Embed & Description */}
        <section className="ad-main-column">
          <AdEmbed
            platform={ad.platform}
            externalId={ad.externalId}
            url={ad.url}
            title={ad.title}
            imageUrl={ad.imageUrl}
          />

          <div className="ad-header-area">
            <h1 className="ad-title-large">{ad.title}</h1>
            {ad.description && <p className="ad-description">{ad.description}</p>}
          </div>
        </section>

        {/* Sidebar: Metadata Attributes */}
        <aside className="ad-sidebar-card" aria-label="Campaign Details">
          <h2 className="ad-sidebar-title">Campaign Information</h2>

          <div className="attributes-list">
            <div className="attribute-row">
              <span className="attr-label">Brand</span>
              <span className="attr-value">
                <Link to={`/brands/${ad.brand.slug}`}>{ad.brand.name}</Link>
              </span>
            </div>

            {ad.product && (
              <div className="attribute-row">
                <span className="attr-label">Product</span>
                <span className="attr-value">{ad.product.name}</span>
              </div>
            )}

            <div className="attribute-row">
              <span className="attr-label">Posting Agency</span>
              <span className="attr-value">
                <Link to={`/agencies/${ad.org.slug}`}>{ad.org.name}</Link>
                {ad.org.verified && (
                  <span className="badge-verified-sm" title="Verified Creator/Agency">
                    ✓
                  </span>
                )}
              </span>
            </div>

            <div className="attribute-row">
              <span className="attr-label">Year</span>
              <span className="attr-value">{ad.year}</span>
            </div>

            <div className="attribute-row">
              <span className="attr-label">Country</span>
              <span className="attr-value">{ad.country}</span>
            </div>

            <div className="attribute-row">
              <span className="attr-label">Medium</span>
              <span className="attr-value">{ad.medium}</span>
            </div>

            <div className="attribute-row">
              <span className="attr-label">Track</span>
              <span className="attr-value">{ad.track}</span>
            </div>

            {ad.tags.length > 0 && (
              <div className="attribute-row">
                <span className="attr-label">Tags</span>
                <div className="tags-wrap">
                  {ad.tags.map((tag) => (
                    <span key={tag.id} className="tag-pill">
                      #{tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Takedown / Report This Ad Form */}
          <div className="report-ad-wrapper">
            {actionData?.reportSuccess ? (
              <div className="alert-banner alert-success" role="status">
                ✓ Report submitted. Moderators have been notified.
              </div>
            ) : (
              <>
                {!showReportForm ? (
                  <button
                    type="button"
                    onClick={() => setShowReportForm(true)}
                    className="btn-report-toggle"
                  >
                    🚩 Report this ad or request takedown
                  </button>
                ) : (
                  <div className="report-form-box">
                    <h4>Report this Ad</h4>
                    <p className="form-hint">
                      Flag copyright infringement, broken embeds, or inappropriate content.
                    </p>

                    {actionData?.reportError && (
                      <div className="alert-banner alert-error" role="alert">
                        {actionData.reportError}
                      </div>
                    )}

                    <Form method="post" className="form-vertical">
                      <div className="form-group">
                        <textarea
                          name="reason"
                          required
                          minLength={5}
                          maxLength={1000}
                          rows={3}
                          placeholder="Please explain the issue or reason for takedown..."
                          className="report-textarea"
                        />
                      </div>

                      <div className="form-actions-row">
                        <button
                          type="button"
                          onClick={() => setShowReportForm(false)}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn btn-danger btn-sm"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? "Submitting..." : "Submit Report"}
                        </button>
                      </div>
                    </Form>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
