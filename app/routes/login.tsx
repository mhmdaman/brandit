import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { prisma } from "~/db.server";
import { createUserSession, getUser, safeRedirect } from "~/session.server";
import { verifyPassword } from "~/utils/password.server";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  getClientIp,
  recordFailedLogin,
} from "~/utils/rateLimit.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Sign In — Brandit" },
    { name: "description", content: "Sign in to manage and submit your campaigns on Brandit." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get("redirectTo"), "/dashboard");

  if (user) {
    return redirect(redirectTo);
  }

  return json({});
}

interface ActionData {
  fieldErrors?: {
    email?: string;
    password?: string;
  };
  formError?: string;
  fields?: {
    email?: string;
  };
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return json<ActionData>({ formError: "Method not allowed" }, { status: 405 });
  }

  const formData = await request.formData();
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawRedirectTo = formData.get("redirectTo");

  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const redirectTo = safeRedirect(rawRedirectTo, "/dashboard");

  const fieldErrors: ActionData["fieldErrors"] = {};

  if (!email) {
    fieldErrors.email = "Email is required.";
  }
  if (!password) {
    fieldErrors.password = "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>({ fieldErrors, fields: { email } }, { status: 400 });
  }

  const clientIp = getClientIp(request);

  // Check rate limit for this IP + email
  if (checkLoginRateLimit(clientIp, email)) {
    return json<ActionData>(
      {
        formError: "Too many failed login attempts. Please wait 15 minutes before trying again.",
        fields: { email },
      },
      { status: 429 }
    );
  }

  // Find user by normalized email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Verify password with timing safe check and generic error message
  const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !isValid) {
    recordFailedLogin(clientIp, email);
    return json<ActionData>(
      {
        formError: "Invalid email or password.",
        fields: { email },
      },
      { status: 400 }
    );
  }

  // Clear failed attempt counter on successful login
  clearLoginRateLimit(clientIp, email);

  return createUserSession(user.id, redirectTo);
}

export default function LoginRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="brand-dot" style={{ margin: "0 auto 0.75rem" }} />
          <h1>Welcome back</h1>
          <p>Sign in to your Brandit account.</p>
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={actionData?.fields?.email || ""}
              className={actionData?.fieldErrors?.email ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.email && (
              <span className="form-error-msg">{actionData.fieldErrors.email}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className={actionData?.fieldErrors?.password ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.password && (
              <span className="form-error-msg">{actionData.fieldErrors.password}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </Form>

        <div className="auth-footer">
          <p>
            Don&apos;t have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
