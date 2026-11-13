import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { OrgType } from "@prisma/client";
import { prisma } from "~/db.server";
import { requireUser } from "~/session.server";
import { generateUniqueOrgSlug } from "~/utils/slugify.server";
import { isValidHttpUrl } from "~/utils/url.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Complete Your Profile — Brandit" },
    { name: "description", content: "Set up your agency, creator, or brand profile on Brandit." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  if (user.orgId) {
    return redirect("/dashboard");
  }
  return json({});
}

interface ActionData {
  fieldErrors?: {
    name?: string;
    type?: string;
    country?: string;
    website?: string;
    bio?: string;
    logoUrl?: string;
  };
  formError?: string;
  fields?: {
    name?: string;
    type?: string;
    country?: string;
    website?: string;
    bio?: string;
    logoUrl?: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ formError: "Method not allowed" }, { status: 405 });
  }

  const user = await requireUser(request);
  if (user.orgId) {
    return redirect("/dashboard");
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim() || "";
  const type = (formData.get("type") as string)?.trim() || "";
  const country = (formData.get("country") as string)?.trim() || "";
  const website = (formData.get("website") as string)?.trim() || "";
  const bio = (formData.get("bio") as string)?.trim() || "";
  const logoUrl = (formData.get("logoUrl") as string)?.trim() || "";

  const fieldErrors: ActionData["fieldErrors"] = {};

  if (!name) {
    fieldErrors.name = "Organization or creator name is required.";
  } else if (name.length < 2 || name.length > 100) {
    fieldErrors.name = "Name must be between 2 and 100 characters.";
  }

  const validTypes = Object.values(OrgType) as string[];
  if (!type || !validTypes.includes(type)) {
    fieldErrors.type = "Please select a valid organization type.";
  }

  if (website) {
    if (!isValidHttpUrl(website)) {
      fieldErrors.website = "Website must be a valid URL starting with http:// or https://";
    }
  }

  if (logoUrl) {
    if (!isValidHttpUrl(logoUrl)) {
      fieldErrors.logoUrl = "Logo URL must be a valid URL starting with http:// or https://";
    }
  }

  if (bio && bio.length > 1000) {
    fieldErrors.bio = "Bio cannot exceed 1000 characters.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>(
      {
        fieldErrors,
        fields: { name, type, country, website, bio, logoUrl },
      },
      { status: 400 }
    );
  }

  try {
    // Generate unique slug with automatic collision handling (-2, -3, ...)
    const slug = await generateUniqueOrgSlug(name);

    // Create organization and link to user in one transaction
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          type: type as OrgType,
          country: country || null,
          website: website || null,
          bio: bio || null,
          logoUrl: logoUrl || null,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { orgId: org.id },
      });

      return org;
    });

    return redirect("/dashboard");
  } catch (error) {
    console.error("Onboarding failed:", error);
    return json<ActionData>(
      {
        formError: "Failed to create organization profile. Please try again.",
        fields: { name, type, country, website, bio, logoUrl },
      },
      { status: 500 }
    );
  }
}

export default function OnboardingRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="form-container">
      <div className="form-card">
        <div className="form-card-header">
          <h1>Create Your Profile</h1>
          <p>Tell the community about your agency, brand, or creative studio.</p>
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
          <div className="form-group">
            <label htmlFor="name">
              Organization or Creator Name <span className="req-star">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Acme Creative, Nike, or Jane Doe"
              defaultValue={actionData?.fields?.name || ""}
              className={actionData?.fieldErrors?.name ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.name && (
              <span className="form-error-msg">{actionData.fieldErrors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="type">
              Profile Type <span className="req-star">*</span>
            </label>
            <select
              id="type"
              name="type"
              required
              defaultValue={actionData?.fields?.type || "AGENCY"}
              className={actionData?.fieldErrors?.type ? "input-error" : ""}
            >
              <option value="AGENCY">Agency — Advertising &amp; Creative Studio</option>
              <option value="CREATOR">Creator — Independent Director, Designer, or Maker</option>
              <option value="BRAND">Brand — In-house Brand or Company</option>
            </select>
            {actionData?.fieldErrors?.type && (
              <span className="form-error-msg">{actionData.fieldErrors.type}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input
                id="country"
                name="country"
                type="text"
                placeholder="e.g. United States, France, Japan"
                defaultValue={actionData?.fields?.country || ""}
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
                defaultValue={actionData?.fields?.website || ""}
                className={actionData?.fieldErrors?.website ? "input-error" : ""}
              />
              {actionData?.fieldErrors?.website && (
                <span className="form-error-msg">{actionData.fieldErrors.website}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="logoUrl">Logo Image URL (optional)</label>
            <input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://example.com/logo.png"
              defaultValue={actionData?.fields?.logoUrl || ""}
              className={actionData?.fieldErrors?.logoUrl ? "input-error" : ""}
            />
            <span className="form-hint">Paste a link to an external image URL.</span>
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
              placeholder="Brief description of your company, notable work, or mission."
              defaultValue={actionData?.fields?.bio || ""}
              className={actionData?.fieldErrors?.bio ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.bio && (
              <span className="form-error-msg">{actionData.fieldErrors.bio}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Setting up profile..." : "Save & Continue to Dashboard"}
          </button>
        </Form>
      </div>
    </div>
  );
}

