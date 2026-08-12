import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Returns the signed-in user's id, or redirects to /login. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}
