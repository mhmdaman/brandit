import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Dashboard — Brandit" },
    { name: "description", content: "Manage your organization campaigns and submissions." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
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

  if (!org) {
    return redirect("/onboarding");
  }

  const ads = await prisma.ad.findMany({
    where: { orgId: org.id },
    include: {
      brand: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
        },
      },
      tags: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ user, org, ads });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const adId = (formData.get("adId") as string)?.trim();

  if (intent === "delete-ad" && adId) {
    // Strict ownership verification: ad.orgId === user.orgId
    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      select: { id: true, orgId: true, status: true },
    });

    if (!ad || ad.orgId !== user.orgId) {
      throw new Response("Forbidden: You do not own this ad.", { status: 403 });
    }

    // Only PENDING or REJECTED ads can be deleted
    if (ad.status !== "PENDING" && ad.status !== "REJECTED") {
      throw new Response("Approved ads cannot be deleted directly. Please contact an administrator.", {
        status: 400,
      });
    }

    await prisma.ad.delete({
      where: { id: adId },
    });

    return redirect("/dashboard?deleted=true");
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function DashboardIndex() {
  const { org, ads } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isDeleting = navigation.state === "submitting" && navigation.formData?.get("intent") === "delete-ad";

  const isSubmitted = searchParams.get("submitted") === "true";
  const isDeleted = searchParams.get("deleted") === "true";

  return (
    <div className="dashboard-container">
      {/* Flash Notifications */}
      {isSubmitted && (
        <div className="alert-banner alert-success" role="status">
          ✓ Campaign submitted successfully! It is currently in review.
        </div>
      )}
      {isDeleted && (
        <div className="alert-banner alert-info" role="status">
          ✓ Campaign submission deleted successfully.
        </div>
      )}

      {/* Organization Profile Overview Card */}
      <section className="dashboard-profile-card">
        <div className="profile-header-group">
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt={org.name}
              className="dashboard-org-logo"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="dashboard-org-avatar">
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="profile-meta">
            <div className="profile-title-row">
              <h1 className="profile-name">{org.name}</h1>
              {org.verified && (
                <span className="badge-verified" title="Verified Organization">
                  ✓ Verified
                </span>
              )}
              <span className="badge-org-type">{org.type}</span>
            </div>

            <div className="profile-details-row">
              {org.country && <span>📍 {org.country}</span>}
              {org.website && (
                <span>
                  🌐{" "}
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="profile-link"
                  >
                    {org.website.replace(/^https?:\/\//, "")} ↗
                  </a>
                </span>
              )}
              <Link to={`/agencies/${org.slug}`} className="profile-link">
                View Public Profile ↗
              </Link>
            </div>

            {org.bio && <p className="profile-bio">{org.bio}</p>}
          </div>
        </div>

        <div className="profile-actions">
          <Link to="/dashboard/profile" className="btn btn-secondary btn-sm">
            Edit Profile
          </Link>
          <Link to="/submit" className="btn btn-primary btn-sm">
            + Submit Campaign
          </Link>
        </div>
      </section>

      {/* Submissions Section */}
      <section className="dashboard-submissions-section">
        <div className="section-header-row">
          <div>
            <h2>Your Campaign Submissions</h2>
            <p className="text-muted">
              Track the review status of your submitted campaigns or make edits.
            </p>
          </div>
          <span className="submissions-count-badge">
            {ads.length} {ads.length === 1 ? "campaign" : "campaigns"}
          </span>
        </div>

        {ads.length === 0 ? (
          <div className="empty-state">
            <h3>No campaigns submitted yet</h3>
            <p>Share your creative ads and commercials with the global advertising community.</p>
            <Link to="/submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
              Submit Your First Ad
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign &amp; Brand</th>
                  <th>Medium</th>
                  <th>Year</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td>
                      <div className="table-ad-cell">
                        <span className="table-ad-title">
                          {ad.status === "APPROVED" ? (
                            <Link to={`/ads/${ad.id}`} className="ad-table-link">
                              {ad.title}
                            </Link>
                          ) : (
                            ad.title
                          )}
                        </span>
                        <span className="table-ad-brand">
                          {ad.brand.name}
                          {ad.product && ` • ${ad.product.name}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge-medium">{ad.medium}</span>
                    </td>
                    <td>{ad.year}</td>
                    <td>
                      <div className="status-badge-container">
                        {ad.status === "PENDING" && (
                          <span className="status-badge badge-pending">
                            ● Pending Review
                          </span>
                        )}
                        {ad.status === "APPROVED" && (
                          <span className="status-badge badge-approved">
                            ✓ Approved
                          </span>
                        )}
                        {ad.status === "REJECTED" && (
                          <div className="rejected-badge-wrap">
                            <span className="status-badge badge-rejected">
                              ✕ Rejected
                            </span>
                            {ad.rejectionReason && (
                              <p className="rejection-reason-text">
                                Reason: {ad.rejectionReason}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="table-actions-cell">
                        <Link
                          to={`/dashboard/ads/${ad.id}/edit`}
                          className="btn-action-edit"
                          title={
                            ad.status === "APPROVED"
                              ? "Editing will return this ad to pending review"
                              : "Edit ad details"
                          }
                        >
                          Edit
                        </Link>

                        {(ad.status === "PENDING" || ad.status === "REJECTED") && (
                          <Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="intent" value="delete-ad" />
                            <input type="hidden" name="adId" value={ad.id} />
                            <button
                              type="submit"
                              className="btn-action-delete"
                              disabled={isDeleting}
                              onClick={(e) => {
                                if (
                                  !confirm(
                                    `Are you sure you want to delete "${ad.title}"? This cannot be undone.`
                                  )
                                ) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              Delete
                            </button>
                          </Form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
