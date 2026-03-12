import Link from "next/link";

import { fetchTrip, fetchTripTimeline } from "@/lib/api";

type PageProps = {
  params: {
    tripId: string;
  };
};

export default async function TripTimelinePage({ params }: PageProps) {
  const [trip, timeline] = await Promise.all([
    fetchTrip(params.tripId),
    fetchTripTimeline(params.tripId),
  ]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Timeline · {trip.name}</h1>
        <Link className="text-sm text-blue-700 underline" href={`/trips/${trip.id}`}>
          Voltar para planejamento
        </Link>
      </header>

      <section className="space-y-4">
        {timeline.days.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">
            Nenhum item na timeline ainda.
          </div>
        ) : (
          timeline.days.map((day) => (
            <article key={day.id} className="rounded-lg border border-neutral-200 p-4">
              <h2 className="font-semibold">Dia {day.day_number}</h2>
              <p className="mb-3 text-xs text-neutral-500">{day.date ?? "Sem data"}</p>

              <div className="mb-3">
                <h3 className="mb-1 text-sm font-medium">Atividades</h3>
                <ul className="space-y-1 text-sm">
                  {day.activities.length === 0 ? (
                    <li className="text-neutral-500">Sem atividades</li>
                  ) : (
                    day.activities.map((activity) => (
                      <li key={activity.id} className="rounded bg-neutral-50 p-2">
                        {activity.title} · {activity.status}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div>
                <h3 className="mb-1 text-sm font-medium">Memórias</h3>
                <ul className="space-y-1 text-sm">
                  {day.memories.length === 0 ? (
                    <li className="text-neutral-500">Sem memórias</li>
                  ) : (
                    day.memories.map((memory) => (
                      <li key={memory.id} className="rounded bg-neutral-50 p-2">
                        {memory.memory_type} · {memory.caption ?? "Sem legenda"}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
