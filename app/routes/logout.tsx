import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { logout } from "~/session.server";

export async function loader() {
  return redirect("/");
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return redirect("/");
  }
  return logout(request);
}

