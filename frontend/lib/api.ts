export type Trip = {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary?: string | null;
  status: string;
};

export type Day = {
  id: string;
  trip_id: string;
  day_number: number;
  date?: string | null;
  notes?: string | null;
};

export type Activity = {
  id: string;
  day_id: string;
  title: string;
  location?: string | null;
  scheduled_time?: string | null;
  notes?: string | null;
  status: string;
};

const API_BASE =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}`);
  }

  return response.json() as Promise<T>;
}

export function fetchTrips(): Promise<Trip[]> {
  return request<Trip[]>("/trips/");
}

export function fetchTrip(tripId: string): Promise<Trip> {
  return request<Trip>(`/trips/${tripId}`);
}

export function fetchDaysByTrip(tripId: string): Promise<Day[]> {
  return request<Day[]>(`/days/?trip_id=${tripId}`);
}

export function fetchActivitiesByDay(dayId: string): Promise<Activity[]> {
  return request<Activity[]>(`/activities/?day_id=${dayId}`);
}
