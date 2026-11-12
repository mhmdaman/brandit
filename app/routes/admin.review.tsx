import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, NavLink, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { prisma } from "~/db.server";
import { requireAdmin } from "~/session.server";
import { AdEmbed } from "~/components/AdEmbed";

export const meta: MetaFunction = () => {
  return [
    { title: "Review Submissions — Admin | Brandit" },
    { name: "description", content: "Review and moderate submitted advertising campaigns." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  // Lists PENDING ads oldest first
  const pendingAds = await prisma.ad.findMany({
    where: { status: "PENDING" },
    include: {
      brand: true,
      product: true,
      org: true,
      tags: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return json({ user, pendingAds });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");
  const adId = (formData.get("adId") as string)?.trim();

  if (!adId && intent !== "toggle-verified") {
    return json({ error: "Ad ID is required" }, { status: 400 });
  }

  if (intent === "approve") {
    await prisma.ad.update({
      where: { id: adId },
      data: {
        status: "APPROVED",
        rejectionReason: null,
      },
    });
    return redirect("/admin/review");
  }

  if (intent === "reject") {
    const rejectionReason = (formData.get("rejectionReason") as string)?.trim() || null;
    await prisma.ad.update({
      where: { id: adId },
      data: {
        status: "REJECTED",
        rejectionReason,
      },
    });
    return redirect("/admin/review");
  }

  if (intent === "toggle-feature") {
    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      select: { featuredAt: true },
    });
    if (ad) {
      await prisma.ad.update({
        where: { id: adId },
        data: {
          featuredAt: ad.featuredAt ? null : new Date(),
        },
      });
    }
    return redirect("/admin/review");
  }

  if (intent === "toggle-verified") {
    const orgId = (formData.get("orgId") as string)?.trim();
    if (orgId) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { verified: true },
      });
      if (org) {
        await prisma.organization.update({
          where: { id: orgId },
          data: { verified: !org.verified },
        });
      }
    }
    return redirect("/admin/review");
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function AdminReviewRoute() {
  const { user, pendingAds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="admin-container">
      {/* Admin Navigation Bar */}
      <div className="admin-nav-header">
        <div className="admin-header-title">
          <h1>Admin Moderation</h1>
          <span className="badge-role">{user.role}</span>
        </div>

        <nav className="admin-nav-tabs" aria-label="Admin Tabs">
          <NavLink
            to="/admin/review"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            Pending Review ({pendingAds.length})
          </NavLink>
          <NavLink
            to="/admin/ads"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            All Campaigns
          </NavLink>
          <NavLink
            to="/admin/reports"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            Takedown Reports
          </NavLink>
          {user.role === "ADMIN" && (
            <NavLink
              to="/admin/brands"
              className={({ isActive }) => (isActive ? "tab-active" : "")}
            >
              Merge Brands
            </NavLink>
          )}
        </nav>
      </div>

      {actionData?.error && (
        <div className="alert-banner alert-error" role="alert">
          {actionData.error}
        </div>
      )}

      {/* Pending Submissions Queue */}
      <section className="admin-queue-section">
        <div className="section-header-row">
          <div>
            <h2>Pending Review Queue</h2>
            <p className="text-muted">
              Showing oldest submissions first. Review the embed facade, brand, and metadata before approving.
            </p>
          </div>
          <span className="submissions-count-badge">
            {pendingAds.length} pending
          </span>
        </div>

        {pendingAds.length === 0 ? (
          <div className="empty-state">
            <h3>Queue is clear!</h3>
            <p>No campaign submissions are currently awaiting moderation.</p>
          </div>
        ) : (
          <div className="admin-queue-grid">
            {pendingAds.map((ad) => (
              <div key={ad.id} className="admin-review-card">
                <div className="admin-card-embed">
                  <AdEmbed
                    platform={ad.platform}
                    externalId={ad.externalId}
                    url={ad.url}
                    title={ad.title}
                    imageUrl={ad.imageUrl}
                  />
                </div>

                <div className="admin-card-content">
                  <div className="admin-card-header">
                    <h3 className="admin-ad-title">{ad.title}</h3>
                    <div className="admin-meta-row">
                      <span className="meta-pill">{ad.brand.name}</span>
                      {ad.product && (
                        <span className="meta-pill product-pill">
                          {ad.product.name}
                        </span>
                      )}
                      <span className="meta-pill">{ad.year}</span>
                      <span className="meta-pill">{ad.country}</span>
                      <span className="meta-pill">{ad.medium}</span>
                      <span className="meta-pill">{ad.track}</span>
                    </div>
                  </div>

                  {ad.description && (
                    <p className="admin-ad-desc">{ad.description}</p>
                  )}

                  {ad.tags.length > 0 && (
                    <div className="admin-tags-wrap">
                      {ad.tags.map((t) => (
                        <span key={t.id} className="tag-pill">
                          #{t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="admin-org-info">
                    <span>
                      Submitted by:{" "}
                      <strong>
                        <Link to={`/agencies/${ad.org.slug}`}>{ad.org.name}</Link>
                      </strong>
                    </span>
                    {ad.org.verified ? (
                      <span className="badge-verified" title="Verified Creator/Agency">
                        ✓ Verified
                      </span>
                    ) : (
                      <Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="toggle-verified" />
                        <input type="hidden" name="orgId" value={ad.org.id} />
                        <button
                          type="submit"
                          className="btn-link-action"
                          title="Verify this organization"
                        >
                          + Verify Org
                        </button>
                      </Form>
                    )}
                    <span className="admin-submission-time">
                      Submitted on: {new Date(ad.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="admin-card-actions">
                    {/* Approve Form */}
                    <Form method="post" className="inline-action-form">
                      <input type="hidden" name="intent" value="approve" />
                      <input type="hidden" name="adId" value={ad.id} />
                      <button
                        type="submit"
                        className="btn btn-success btn-sm"
                        disabled={isSubmitting}
                      >
                        ✓ Approve Ad
                      </button>
                    </Form>

                    {/* Reject with optional reason Form */}
                    <Form method="post" className="reject-action-form">
                      <input type="hidden" name="intent" value="reject" />
                      <input type="hidden" name="adId" value={ad.id} />
                      <input
                        type="text"
                        name="rejectionReason"
                        placeholder="Rejection reason (optional)"
                        className="input-reason-sm"
                      />
                      <button
                        type="submit"
                        className="btn btn-danger btn-sm"
                        disabled={isSubmitting}
                      >
                        ✕ Reject
                      </button>
                    </Form>

                    {/* Feature / Unfeature Form */}
                    <Form method="post" className="inline-action-form">
                      <input type="hidden" name="intent" value="toggle-feature" />
                      <input type="hidden" name="adId" value={ad.id} />
                      <button
                        type="submit"
                        className={`btn btn-sm ${
                          ad.featuredAt ? "btn-warning" : "btn-secondary"
                        }`}
                        disabled={isSubmitting}
                      >
                        {ad.featuredAt ? "★ Featured" : "☆ Feature"}
                      </button>
                    </Form>

                    {/* Edit ad link */}
                    <Link
                      to={`/dashboard/ads/${ad.id}/edit`}
                      className="btn btn-secondary btn-sm"
                    >
                      ✎ Edit Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
