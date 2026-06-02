import type { NextAuthConfig } from "next-auth";

const PROTECTED = ["/dashboard", "/transactions", "/budgets", "/splits"];

// Edge-safe config (no bcrypt / Prisma) so it can power the middleware.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isAuthPage = path === "/login" || path === "/register";
      const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

      if (isProtected && !isLoggedIn) return false; // redirect to signIn page
      if (isAuthPage && isLoggedIn)
        return Response.redirect(new URL("/dashboard", nextUrl));
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
