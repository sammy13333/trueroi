import { AuthForm } from "@/components/auth-form";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  return <main className="min-h-screen bg-[#060a0f] px-5"><AuthForm /></main>;
}
