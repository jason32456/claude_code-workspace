import { AuthForm } from "@/components/auth-form";
import { registerUser } from "./actions";

export default function RegisterPage() {
  return <AuthForm mode="register" action={registerUser} />;
}
