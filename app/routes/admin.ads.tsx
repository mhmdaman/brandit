import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, NavLink, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import type { AdStatus } from "@prisma/client";
import { prisma } from "~/db.server";
import { requireAdmin } from "~/session.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Manage All Campaigns — Admin | Brandit" },
    { name: "description", content: "Search and manage status of all ad campaigns." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || "";
  const statusFilter = url.searchParams.get("status")?.trim() || "";

  const whereClause: any = {};

  if (statusFilter && ["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    whereClause.status = statusFilter;
  }

  if (q) {
    whereClause.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { brand: { name: { contains: q, mode: "insensitive" } } },
      { org: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const ads = await prisma.ad.findMany({
    where: whereClause,
    include: {
      brand: true,
      product: true,
      org: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({ user, ads, q, statusFilter });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");
  const adId = (formData.get("adId") as string)?.trim();

  if (!adId) {
    return json({ error: "Ad ID is required" }, { status: 400 });
  }

  if (intent === "set-status") {
    const newStatus = (formData.get("status") as string)?.trim() as AdStatus;
    if (["PENDING", "APPROVED", "REJECTED"].includes(newStatus)) {
      await prisma.ad.update({
        where: { id: adId },
        data: {
          status: newStatus,
          rejectionReason: newStatus === "REJECTED" ? "Rejected by administrator." : null,
        },
      });
    }
    return redirect(request.url);
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
    return redirect(request.url);
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function AdminAdsRoute() {
  const { user, ads, q, statusFilter } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
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
            Pending Review
          </NavLink>
          <NavLink
            to="/admin/ads"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            All Campaigns ({ads.length})
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

      <section className="admin-queue-section">
        <div className="admin-filters-bar">
          <Form method="get" className="admin-search-form">
            <input
              type="text"
              name="q"
              placeholder="Search by title, brand, or submitting org..."
              defaultValue={q}
              className="admin-search-input"
            />

            <select
              name="status"
              defaultValue={statusFilter}
              className="admin-filter-select"
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved Only</option>
              <option value="PENDING">Pending Only</option>
              <option value="REJECTED">Rejected Only</option>
            </select>

            <button type="submit" className="btn btn-secondary btn-sm">
              Filter
            </button>
            {(q || statusFilter) && (
              <Link to="/admin/ads" className="btn btn-secondary btn-sm">
                Clear
              </Link>
            )}
          </Form>
        </div>

        {ads.length === 0 ? (
          <div className="empty-state">
            <h3>No campaigns found</h3>
            <p>Try searching with different keywords or removing filters.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campaign &amp; Brand</th>
                  <th>Submitting Org</th>
                  <th>Year</th>
                  <th>Featured</th>
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
                          <Link to={`/ads/${ad.id}`} className="ad-table-link">
                            {ad.title}
                          </Link>
                        </span>
                        <span className="table-ad-brand">
                          {ad.brand.name}
                          {ad.product && ` • ${ad.product.name}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Link to={`/agencies/${ad.org.slug}`} className="ad-table-link">
                        {ad.org.name}
                      </Link>
                    </td>
                    <td>{ad.year}</td>
                    <td>
                      <Form method="post" style={{ display: "inline" }}>
                        <input type="hidden" name="intent" value="toggle-feature" />
                        <input type="hidden" name="adId" value={ad.id} />
                        <button
                          type="submit"
                          className={`btn-feature-pill ${
                            ad.featuredAt ? "featured-active" : ""
                          }`}
                          disabled={isSubmitting}
                          title={ad.featuredAt ? "Remove from featured" : "Feature on homepage"}
                        >
                          {ad.featuredAt ? "★ Featured" : "☆ Feature"}
                        </button>
                      </Form>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          ad.status === "APPROVED"
                            ? "badge-approved"
                            : ad.status === "PENDING"
                            ? "badge-pending"
                            : "badge-rejected"
                        }`}
                      >
                        {ad.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="table-actions-cell">
                        <Form method="post" className="inline-action-form">
                          <input type="hidden" name="intent" value="set-status" />
                          <input type="hidden" name="adId" value={ad.id} />
                          <select
                            name="status"
                            defaultValue={ad.status}
                            onChange={(e) => e.target.form?.requestSubmit()}
                            className="select-status-inline"
                          >
                            <option value="APPROVED">Set Approved</option>
                            <option value="PENDING">Set Pending</option>
                            <option value="REJECTED">Set Rejected</option>
                          </select>
                        </Form>

                        <Link
                          to={`/dashboard/ads/${ad.id}/edit`}
                          className="btn-action-edit"
                        >
                          Edit
                        </Link>
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
