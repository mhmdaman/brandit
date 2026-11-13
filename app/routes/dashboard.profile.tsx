import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";
import { isValidHttpUrl } from "~/utils/url.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Edit Organization Profile — Brandit" },
    { name: "description", content: "Update your organization profile details." },
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
    },
  });

  if (!org) {
    return redirect("/onboarding");
  }

  return json({ org });
}

interface ActionData {
  fieldErrors?: {
    name?: string;
    website?: string;
    logoUrl?: string;
    bio?: string;
    country?: string;
  };
  formError?: string;
  fields?: {
    name?: string;
    website?: string;
    logoUrl?: string;
    bio?: string;
    country?: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ formError: "Method not allowed" }, { status: 405 });
  }

  const user = await requireUser(request);
  if (!user.orgId) {
    return redirect("/onboarding");
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim() || "";
  const country = (formData.get("country") as string)?.trim() || "";
  const website = (formData.get("website") as string)?.trim() || "";
  const logoUrl = (formData.get("logoUrl") as string)?.trim() || "";
  const bio = (formData.get("bio") as string)?.trim() || "";

  const fieldErrors: ActionData["fieldErrors"] = {};

  if (!name) {
    fieldErrors.name = "Organization name is required.";
  } else if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Name must be between 2 and 100 characters.";
  }

  if (website && !isValidHttpUrl(website)) {
    fieldErrors.website = "Website must be a valid URL starting with http:// or https://";
  }

  if (logoUrl && !isValidHttpUrl(logoUrl)) {
    fieldErrors.logoUrl = "Logo URL must be a valid URL starting with http:// or https://";
  }

  if (bio && bio.length > 1000) {
    fieldErrors.bio = "Bio cannot exceed 1000 characters.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>(
      {
        fieldErrors,
        fields: { name, country, website, logoUrl, bio },
      },
      { status: 400 }
    );
  }

  // Update without changing the slug
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      name,
      country: country || null,
      website: website || null,
      logoUrl: logoUrl || null,
      bio: bio || null,
    },
  });

  return redirect("/dashboard");
}

export default function DashboardProfileRoute() {
  const { org } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="form-card-header">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="breadcrumbs-sep">/</span>
            <span>Edit Profile</span>
          </nav>
          <h1>Edit Profile</h1>
          <p>Update your public brand, creator, or agency details.</p>
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
          <div className="form-group">
            <label htmlFor="name">
              Organization Name <span className="req-star">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={actionData?.fields?.name ?? org.name}
              className={actionData?.fieldErrors?.name ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.name && (
              <span className="form-error-msg">{actionData.fieldErrors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="slug-disabled">Profile Slug (Permanent)</label>
            <input
              id="slug-disabled"
              type="text"
              disabled
              value={org.slug}
              className="input-disabled"
            />
            <span className="form-hint">Slugs cannot be changed to prevent breaking links.</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input
                id="country"
                name="country"
                type="text"
                placeholder="e.g. United States, France"
                defaultValue={actionData?.fields?.country ?? (org.country || "")}
                className={actionData?.fieldErrors?.country ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.country && (
                <span className="form-error-msg">{actionData.fieldErrors.country}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="website">Website (http or https)</label>
              <input
                id="website"
                name="website"
                type="url"
                placeholder="https://example.com"
                defaultValue={actionData?.fields?.website ?? (org.website || "")}
                className={actionData?.fieldErrors?.website ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.website && (
                <span className="form-error-msg">{actionData.fieldErrors.website}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="logoUrl">Logo Image URL</label>
            <input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              defaultValue={actionData?.fields?.logoUrl ?? (org.logoUrl || "")}
              className={actionData?.fieldErrors?.logoUrl ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.logoUrl && (
              <span className="form-error-msg">{actionData.fieldErrors.logoUrl}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="bio">Bio or Statement</label>
            <textarea
              id="bio"
              name="bio"
              rows={4}
              maxLength={1000}
              placeholder="Tell the community about your creative focus and story."
              defaultValue={actionData?.fields?.bio ?? (org.bio || "")}
              className={actionData?.fieldErrors?.bio ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.bio && (
              <span className="form-error-msg">{actionData.fieldErrors.bio}</span>
            )}
          </div>

          <div className="form-actions-row">
            <Link to="/dashboard" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving Changes..." : "Save Changes"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

