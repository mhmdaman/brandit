import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import stylesHref from "./styles.css?url";
import { Layout } from "./components/Layout";
import { getUser } from "./session.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesHref },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600&display=swap",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  return json({
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          orgId: user.orgId,
          org: user.org
            ? {
                id: user.org.id,
                name: user.org.name,
                slug: user.org.slug,
                verified: user.org.verified,
              }
            : null,
        }
      : null,
  });
}

export function DocumentLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Layout>{children}</Layout>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <DocumentLayout>
      <Outlet />
    </DocumentLayout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Something went wrong";
  let message = "An unexpected error occurred. Please try again later.";
  let status = 500;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (error.status === 404) {
      title = "404 - Page Not Found";
      message = "The campaign, brand, or agency page you were looking for could not be found.";
    } else {
      title = `${error.status} ${error.statusText}`;
      message = error.data?.message || "There was a problem loading this page.";
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <DocumentLayout>
      <div className="empty-state" style={{ maxWidth: "600px", margin: "4rem auto" }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>{status === 404 ? "404" : "Error"}</h1>
        <h2>{title}</h2>
        <p style={{ marginTop: "0.75rem", marginBottom: "1.5rem" }}>{message}</p>
        <a href="/" className="btn-external-link" style={{ textDecoration: "none" }}>
          Return Home
        </a>
      </div>
    </DocumentLayout>
  );
}
