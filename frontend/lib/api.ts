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

export type Memory = {
  id: string;
  trip_id: string;
  day_id?: string | null;
  activity_id?: string | null;
  memory_type: string;
  storage_key: string;
  caption?: string | null;
  taken_at?: string | null;
  created_at: string;
};

export type Timeline = {
  trip_id: string;
  days: Array<{
    id: string;
    day_number: number;
    date?: string | null;
    activities: Array<{
      id: string;
      title: string;
      location?: string | null;
      scheduled_time?: string | null;
      status: string;
    }>;
    memories: Array<{
      id: string;
      memory_type: string;
      caption?: string | null;
      storage_key: string;
      created_at: string;
    }>;
  }>;
};

export type UploadPresignResponse = {
  object_key: string;
  upload_url: string;
  expires_in: number;
};

const API_BASE =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

const COUPLE_ACCESS_TOKEN =
  process.env.COUPLE_ACCESS_TOKEN ??
  process.env.NEXT_PUBLIC_COUPLE_ACCESS_TOKEN ??
  "";

export const API_BASE_PUBLIC =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

async function request<T>(
  path: string,
  options?: RequestInit,
  baseUrl: string = API_BASE,
): Promise<T> {
  const headers = new Headers(options?.headers);
  if (COUPLE_ACCESS_TOKEN) {
    headers.set("Authorization", `Bearer ${COUPLE_ACCESS_TOKEN}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers,
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}`);
  }

  if (response.status === 204) {
    return undefined as T;
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

export function fetchTripTimeline(tripId: string): Promise<Timeline> {
  return request<Timeline>(`/trips/${tripId}/timeline`);
}

export function fetchMemoriesByTrip(tripId: string): Promise<Memory[]> {
  return request<Memory[]>(`/memories/?trip_id=${tripId}`);
}

export function createTrip(payload: {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  summary?: string;
  status?: string;
}): Promise<Trip> {
  return request<Trip>(
    "/trips/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function createDay(payload: {
  trip_id: string;
  day_number: number;
  date?: string;
  notes?: string;
}): Promise<Day> {
  return request<Day>(
    "/days/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function updateDay(
  dayId: string,
  payload: { day_number?: number; date?: string; notes?: string },
): Promise<Day> {
  return request<Day>(
    `/days/${dayId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function createActivity(payload: {
  day_id: string;
  title: string;
  location?: string;
  scheduled_time?: string;
  notes?: string;
  status?: string;
}): Promise<Activity> {
  return request<Activity>(
    "/activities/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function updateActivity(
  activityId: string,
  payload: {
    title?: string;
    location?: string;
    scheduled_time?: string;
    notes?: string;
    status?: string;
  },
): Promise<Activity> {
  return request<Activity>(
    `/activities/${activityId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function deleteActivity(activityId: string): Promise<void> {
  return request<void>(
    `/activities/${activityId}`,
    {
      method: "DELETE",
    },
    API_BASE_PUBLIC,
  );
}

export function createUploadPresign(payload: {
  trip_id: string;
  day_id?: string;
  activity_id?: string;
  filename: string;
  content_type: string;
  file_size_bytes: number;
}): Promise<UploadPresignResponse> {
  return request<UploadPresignResponse>(
    "/uploads/presign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function completeUpload(payload: {
  trip_id: string;
  day_id?: string;
  activity_id?: string;
  memory_type: string;
  object_key: string;
  caption?: string;
  taken_at?: string;
}): Promise<{ memory_id: string; object_key: string }> {
  return request<{ memory_id: string; object_key: string }>(
    "/uploads/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}
