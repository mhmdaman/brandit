import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, NavLink, useActionData, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import { prisma } from "~/db.server";
import { requireAdmin } from "~/session.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Merge Brands — Admin | Brandit" },
    { name: "description", content: "Merge duplicate brands and consolidate campaign history." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  // ADMIN ONLY
  const user = await requireAdmin(request, { adminOnly: true });

  const brands = await prisma.brand.findMany({
    include: {
      _count: {
        select: {
          ads: true,
          products: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return json({ user, brands });
}

interface ActionData {
  error?: string;
  success?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ error: "Method not allowed" }, { status: 405 });
  }

  // ADMIN ONLY
  await requireAdmin(request, { adminOnly: true });

  const formData = await request.formData();
  const sourceBrandId = (formData.get("sourceBrandId") as string)?.trim();
  const targetBrandId = (formData.get("targetBrandId") as string)?.trim();

  if (!sourceBrandId || !targetBrandId) {
    return json<ActionData>({ error: "Please select both a source brand and a target brand." }, { status: 400 });
  }

  if (sourceBrandId === targetBrandId) {
    return json<ActionData>({ error: "Source and target brand cannot be the same." }, { status: 400 });
  }

  const [sourceBrand, targetBrand] = await Promise.all([
    prisma.brand.findUnique({
      where: { id: sourceBrandId },
      include: { products: true },
    }),
    prisma.brand.findUnique({
      where: { id: targetBrandId },
      include: { products: true },
    }),
  ]);

  if (!sourceBrand || !targetBrand) {
    return json<ActionData>({ error: "One or both selected brands could not be found." }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Re-parent or merge products
      for (const sourceProd of sourceBrand.products) {
        const matchingTargetProd = targetBrand.products.find(
          (tp) => tp.slug === sourceProd.slug || tp.name.toLowerCase() === sourceProd.name.toLowerCase()
        );

        if (matchingTargetProd) {
          // Re-link ads using this product to target product
          await tx.ad.updateMany({
            where: { productId: sourceProd.id },
            data: { productId: matchingTargetProd.id },
          });
          // Delete duplicate product
          await tx.product.delete({
            where: { id: sourceProd.id },
          });
        } else {
          // Move product to target brand
          await tx.product.update({
            where: { id: sourceProd.id },
            data: { brandId: targetBrand.id },
          });
        }
      }

      // 2. Move all ads from source brand to target brand
      await tx.ad.updateMany({
        where: { brandId: sourceBrand.id },
        data: { brandId: targetBrand.id },
      });

      // 3. Delete duplicate source brand
      await tx.brand.delete({
        where: { id: sourceBrand.id },
      });
    });

    return redirect("/admin/brands?merged=true");
  } catch (error) {
    console.error("Brand merge failed:", error);
    return json<ActionData>(
      { error: "Failed to merge brands due to an internal error. Please try again." },
      { status: 500 }
    );
  }
}

export default function AdminBrandsRoute() {
  const { user, brands } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const isMerged = searchParams.get("merged") === "true";

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
            Takedown Reports
          </NavLink>
          <NavLink
            to="/admin/brands"
            className={({ isActive }) => (isActive ? "tab-active" : "")}
          >
            Merge Brands
          </NavLink>
        </nav>
      </div>

      {isMerged && (
        <div className="alert-banner alert-success" role="status">
          ✓ Brands merged successfully! All associated campaigns and products have been consolidated.
        </div>
      )}

      {actionData?.error && (
        <div className="alert-banner alert-error" role="alert">
          {actionData.error}
        </div>
      )}

      <div className="admin-two-col-layout">
        {/* Left Column: Merge Tool */}
        <section className="admin-merge-card">
          <div className="section-header-row">
            <div>
              <h2>Consolidate Duplicate Brands</h2>
              <p className="text-muted">
                Transfer all campaigns and products from a duplicate brand into the canonical brand, then delete the duplicate.
              </p>
            </div>
          </div>

          <Form method="post" className="form-vertical">
            <div className="form-group">
              <label htmlFor="sourceBrandId">
                Duplicate Brand to Delete (Source) <span className="req-star">*</span>
              </label>
              <select id="sourceBrandId" name="sourceBrandId" required className="select-input">
                <option value="">-- Choose duplicate brand to remove --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b._count.ads} ads, {b._count.products} products)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="targetBrandId">
                Canonical Brand to Keep (Target) <span className="req-star">*</span>
              </label>
              <select id="targetBrandId" name="targetBrandId" required className="select-input">
                <option value="">-- Choose canonical brand to keep --</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b._count.ads} ads, {b._count.products} products)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-danger btn-block"
              disabled={isSubmitting}
              onClick={(e) => {
                if (!confirm("Are you sure? This will permanently move campaigns and remove the duplicate brand.")) {
                  e.preventDefault();
                }
              }}
            >
              {isSubmitting ? "Merging Brands..." : "Merge Brands into Canonical"}
            </button>
          </Form>
        </section>

        {/* Right Column: Brands Directory */}
        <section className="admin-brands-list-card">
          <div className="section-header-row">
            <div>
              <h2>All Brands ({brands.length})</h2>
              <p className="text-muted">Active brand entries in database.</p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th>Ads</th>
                  <th>Products</th>
                  <th style={{ textAlign: "right" }}>View</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      <span className="text-muted" style={{ display: "block", fontSize: "0.8rem" }}>
                        /{b.slug}
                      </span>
                    </td>
                    <td>{b._count.ads}</td>
                    <td>{b._count.products}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link to={`/brands/${b.slug}`} className="ad-table-link">
                        View ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

