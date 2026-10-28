import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the request path to server components as `x-pathname` so layouts can mark the current
 * section in navigation without client-side JavaScript. No auth, no rewrites happen here.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
