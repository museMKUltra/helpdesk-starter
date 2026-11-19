import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type Health = { status: string; database: string };

export default function HomePage() {
  const { data: health, isError } = useQuery({
    queryKey: ["health"],
    queryFn: async ({ signal }) =>
      // A degraded server still answers 503 with a Health body, so treat it as data.
      (
        await api.get<Health>("/health", {
          signal,
          validateStatus: (s) => s === 200 || s === 503,
        })
      ).data,
  });
  const error = isError ? "Server unreachable" : null;

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-gray-600">
        {error ?? (health ? `API: ${health.status} · DB: ${health.database}` : "Checking API…")}
      </p>
    </main>
  );
}
