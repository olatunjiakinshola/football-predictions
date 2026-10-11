import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;

  // No password set (local development): the site stays open.
  if (!password) return NextResponse.next();

  // The scheduler is checked by its own secret inside the route.
  if (request.nextUrl.pathname === "/api/track") return NextResponse.next();

  const header = request.headers.get("authorization");

  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(":");

      if (sep >= 0) {
        const user = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);

        if (user === (process.env.SITE_USER ?? "tester") && pass === password) {
          return NextResponse.next();
        }
      }
    } catch {
      // fall through to the login prompt
    }
  }

  return new NextResponse("Login required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Match Stats Predictor test"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};