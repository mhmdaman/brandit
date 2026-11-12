import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, NavLink, useLoaderData, useNavigation } from "@remix-run/react";
import { prisma } from "~/db.server";
import { requireAdmin } from "~/session.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Takedown Reports — Admin | Brandit" },
    { name: "description", content: "Review user-submitted takedown and policy reports." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  const reports = await prisma.report.findMany({
    include: {
      ad: {
        include: {
          brand: true,
          org: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return json({ user, reports });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  await requireAdmin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");
  const reportId = (formData.get("reportId") as string)?.trim();
  const adId = (formData.get("adId") as string)?.trim();

  if (!reportId) {
    return json({ error: "Report ID required" }, { status: 400 });
  }

  // Dismiss report
  if (intent === "dismiss") {
    await prisma.report.delete({
      where: { id: reportId },
    });
    return redirect("/admin/reports");
  }

  // Reject ad (takedown) and remove report
  if (intent === "reject-ad" && adId) {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { reason: true },
    });

    await prisma.ad.update({
      where: { id: adId },
      data: {
        status: "REJECTED",
        rejectionReason: `Taken down due to report: ${report?.reason || "Copyright/Content violation"}`,
      },
    });

    await prisma.report.delete({
      where: { id: reportId },
    });

    return redirect("/admin/reports");
  }

  return json({ error: "Invalid action" }, { status: 400 });
}

export default function AdminReportsRoute() {
  const { user, reports } = useLoaderData<typeof loader>();
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
            All Campaigns
          </NavLink>
          <NavLink
            to="/admin/reports"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            Takedown Reports ({reports.length})
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
        <div className="section-header-row">
          <div>
            <h2>Takedown &amp; Violation Reports</h2>
            <p className="text-muted">
              Review flagged campaigns reported by community members or copyright holders.
            </p>
          </div>
          <span className="submissions-count-badge">
            {reports.length} {reports.length === 1 ? "report" : "reports"}
          </span>
        </div>

        {reports.length === 0 ? (
          <div className="empty-state">
            <h3>No reports pending</h3>
            <p>All clear! There are currently no user-submitted takedown requests.</p>
          </div>
        ) : (
          <div className="admin-reports-list">
            {reports.map((report) => (
              <div key={report.id} className="report-card">
                <div className="report-card-header">
                  <div>
                    <h3 className="report-ad-title">
                      <Link to={`/ads/${report.ad.id}`} className="ad-table-link">
                        {report.ad.title}
                      </Link>
                    </h3>
                    <span className="report-ad-sub">
                      Brand: {report.ad.brand.name} • Agency: {report.ad.org.name} • Current Status:{" "}
                      <strong>{report.ad.status}</strong>
                    </span>
                  </div>
                  <span className="report-date">
                    Reported on {new Date(report.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="report-reason-box">
                  <strong>Reported Reason:</strong>
                  <p>{report.reason}</p>
                </div>

                <div className="report-actions">
                  <Form method="post" className="inline-action-form">
                    <input type="hidden" name="intent" value="reject-ad" />
                    <input type="hidden" name="reportId" value={report.id} />
                    <input type="hidden" name="adId" value={report.ad.id} />
                    <button
                      type="submit"
                      className="btn btn-danger btn-sm"
                      disabled={isSubmitting}
                      onClick={(e) => {
                        if (!confirm("Reject and take down this campaign?")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      ✕ Takedown Campaign (Reject)
                    </button>
                  </Form>

                  <Form method="post" className="inline-action-form">
                    <input type="hidden" name="intent" value="dismiss" />
                    <input type="hidden" name="reportId" value={report.id} />
                    <button
                      type="submit"
                      className="btn btn-secondary btn-sm"
                      disabled={isSubmitting}
                    >
                      Dismiss Report
                    </button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
