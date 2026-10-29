import { useEffect, useState } from "react";

type Health = { status: string; database: string };

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setError("Server unreachable"));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-gray-600">
        {error ?? (health ? `API: ${health.status} · DB: ${health.database}` : "Checking API…")}
      </p>
    </main>
  );
}
