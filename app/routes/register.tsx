import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { prisma } from "~/db.server";
import { createUserSession, getUser } from "~/session.server";
import { hashPassword } from "~/utils/password.server";
import { checkRegisterRateLimit, getClientIp } from "~/utils/rateLimit.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Register — Brandit" },
    { name: "description", content: "Create an account on Brandit to submit and showcase ad campaigns." },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (user) {
    if (user.orgId) {
      return redirect("/dashboard");
    }
    return redirect("/onboarding");
  }
  return json({});
}

interface ActionData {
  fieldErrors?: {
    email?: string;
    password?: string;
    confirmPassword?: string;
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

  const clientIp = getClientIp(request);
  if (checkRegisterRateLimit(clientIp)) {
    return json<ActionData>(
      {
        formError: "Too many registration attempts from this network. Please try again in an hour.",
      },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");
  const rawConfirmPassword = formData.get("confirmPassword");

  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const confirmPassword = typeof rawConfirmPassword === "string" ? rawConfirmPassword : "";

  const fieldErrors: ActionData["fieldErrors"] = {};

  // Email validation
  if (!email) {
    fieldErrors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }

  // Password validation
  if (!password) {
    fieldErrors.password = "Password is required.";
  } else if (password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters long.";
  }

  // Confirm password validation
  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>({ fieldErrors, fields: { email } }, { status: 400 });
  }

  // Check for duplicate email
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return json<ActionData>(
      {
        fieldErrors: { email: "An account with this email address already exists." },
        fields: { email },
      },
      { status: 400 }
    );
  }

  // Create user with hashed password
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "USER",
    },
  });

  // Create session and send to onboarding
  return createUserSession(user.id, "/onboarding");
}

export default function RegisterRoute() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <span className="brand-dot" style={{ margin: "0 auto 0.75rem" }} />
          <h1>Create an account</h1>
          <p>Join Brandit to showcase your campaigns and creative work.</p>
        </div>

        {actionData?.formError && (
          <div className="alert-banner alert-error" role="alert">
            {actionData.formError}
          </div>
        )}

        <Form method="post" className="form-vertical" noValidate>
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
              autoComplete="new-password"
              required
              className={actionData?.fieldErrors?.password ? "input-error" : ""}
            />
            <span className="form-hint">At least 8 characters.</span>
            {actionData?.fieldErrors?.password && (
              <span className="form-error-msg">{actionData.fieldErrors.password}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className={actionData?.fieldErrors?.confirmPassword ? "input-error" : ""}
            />
            {actionData?.fieldErrors?.confirmPassword && (
              <span className="form-error-msg">{actionData.fieldErrors.confirmPassword}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </Form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

