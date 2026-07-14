import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ accepted?: string }>;
}) {
  const { accepted } = await searchParams;
  return <LoginForm accepted={accepted === "1"} />;
}
