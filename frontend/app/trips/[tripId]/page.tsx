import { fetchActivitiesByDay, fetchDaysByTrip, fetchTrip } from "@/lib/api";

type PageProps = {
  params: {
    tripId: string;
  };
};

export default async function TripDetailsPage({ params }: PageProps) {
  const trip = await fetchTrip(params.tripId);
  const days = await fetchDaysByTrip(params.tripId);

  const dayBlocks = await Promise.all(
    days.map(async (day) => ({
      ...day,
      activities: await fetchActivitiesByDay(day.id),
    })),
  );

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{trip.name}</h1>
        <p className="text-sm text-neutral-600">{trip.destination}</p>
        <p className="text-sm text-neutral-500">
          {trip.start_date} → {trip.end_date}
        </p>
      </header>

      <section className="space-y-4">
        {dayBlocks.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-neutral-600">
            Nenhum dia planejado para esta viagem.
          </div>
        ) : (
          dayBlocks.map((day) => (
            <article key={day.id} className="rounded-lg border border-neutral-200 p-4">
              <h2 className="font-semibold">Dia {day.day_number}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {day.activities.length === 0 ? (
                  <li className="text-neutral-500">Sem atividades.</li>
                ) : (
                  day.activities.map((activity) => (
                    <li key={activity.id} className="rounded bg-neutral-50 p-2">
                      <span className="font-medium">{activity.title}</span>
                      {activity.location ? ` · ${activity.location}` : ""}
                    </li>
                  ))
                )}
              </ul>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
