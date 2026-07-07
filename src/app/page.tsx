import { prisma } from "@/lib/prisma";

export default async function Home() {
  const result = await prisma.$queryRaw<
    { result: number }[]
  >`SELECT 1 as result`;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-primary">
        GDGC Recruitment Platform
      </h1>
      <p className="mt-2">
        Database connection:{" "}
        {result[0]?.result === 1 ? "✅ working" : "❌ failed"}
      </p>
    </main>
  );
}
