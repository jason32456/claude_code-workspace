import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and the auth API route.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
