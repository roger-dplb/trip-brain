export type Trip = {
  id: string;
  name: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  summary?: string | null;
  status: string;
  cover_image_url?: string | null;
};

export type Location = {
  id: string;
  country: string;
  city: string;
  region?: string | null;
  place_name?: string | null;
};

export type Day = {
  id: string;
  trip_id: string;
  day_number: number;
  date?: string | null;
  notes?: string | null;
  location?: Location | null;
};

export type Activity = {
  id: string;
  day_id: string;
  title: string;
  location?: string | null;
  scheduled_time?: string | null;
  notes?: string | null;
  status: string;
  location_detail?: Location | null;
};

export type Memory = {
  id: string;
  trip_id: string;
  day_id?: string | null;
  activity_id?: string | null;
  memory_type: string;
  storage_key: string;
  public_url?: string | null;
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
    location?: Location | null;
    activities: Array<{
      id: string;
      title: string;
      location?: string | null;
      scheduled_time?: string | null;
      status: string;
      location_detail?: Location | null;
    }>;
    memories: Array<{
      id: string;
      activity_id?: string | null;
      memory_type: string;
      caption?: string | null;
      storage_key: string;
      public_url?: string | null;
      created_at: string;
    }>;
  }>;
};

export type UploadPresignResponse = {
  object_key: string;
  upload_url: string;
  expires_in: number;
  public_url: string;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  expires_at: number;
  actor: string;
  role: string;
};

export type StoryExportJob = {
  job_id: string;
  status: "queued" | "processing" | "done" | "failed";
  cached?: boolean;
  zip_url?: string | null;
  mp4_url?: string | null;
  error_msg?: string | null;
};

const API_BASE =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000/api/v1";

const COUPLE_ACCESS_TOKEN =
  process.env.COUPLE_ACCESS_TOKEN ??
  process.env.NEXT_PUBLIC_COUPLE_ACCESS_TOKEN ??
  "";

const TOKEN_STORAGE_KEY = "trip_archive_access_token";

export const API_BASE_PUBLIC =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getStoredAccessToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setStoredAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function resolveAccessToken(): string {
  return getStoredAccessToken() || COUPLE_ACCESS_TOKEN;
}

async function request<T>(
  path: string,
  options?: RequestInit,
  baseUrl: string = API_BASE,
): Promise<T> {
  const { headers: optionHeaders, ...restOptions } = options ?? {};
  const headers = new Headers(optionHeaders);
  const accessToken = resolveAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    ...restOptions,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(`API request failed for ${path}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function loginCouple(payload: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  return request<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function fetchTrips(): Promise<Trip[]> {
  return request<Trip[]>("/trips/");
}

export function fetchTrip(tripId: string): Promise<Trip> {
  return request<Trip>(`/trips/${tripId}`);
}

export function updateTrip(
  tripId: string,
  data: { cover_image_url?: string | null },
): Promise<Trip> {
  return request<Trip>(
    `/trips/${tripId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    API_BASE_PUBLIC,
  );
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

export function deleteMemory(memoryId: string): Promise<void> {
  return request<void>(`/memories/${memoryId}`, { method: "DELETE" });
}

export function createTrip(payload: {
  name: string;
  destinations: string[];
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

export function deleteDay(dayId: string): Promise<void> {
  return request<void>(
    `/days/${dayId}`,
    {
      method: "DELETE",
    },
    API_BASE_PUBLIC,
  );
}

export function deleteTrip(tripId: string | number): Promise<void> {
  return request<void>(
    `/trips/${tripId}`,
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

export type ItineraryJobEnqueuedResponse = {
  trip_id: string;
  job_id: string;
  trip_status: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  answer: string;
  used_context: boolean;
};

export function generateItinerary(payload: {
  trip_id: string;
  preferences?: string;
  max_days?: number;
}): Promise<ItineraryJobEnqueuedResponse> {
  return request<ItineraryJobEnqueuedResponse>(
    "/rag/itinerary",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function chatWithTrip(
  tripId: string,
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  return request<ChatResponse>(
    "/rag/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, message, history }),
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

export type TripImportResponse = {
  trip_id: string;
  job_id: string;
  trip_status: string;
};

export type TripAddMediaResponse = {
  trip_id: string;
  job_id: string;
};

export type ImportPresignResponse = {
  session_id: string;
  object_key: string;
  upload_url: string;
  expires_in: number;
  public_url: string;
};

export function createImportPresign(payload: {
  session_id?: string;
  filename: string;
  content_type: string;
  file_size_bytes: number;
}): Promise<ImportPresignResponse> {
  return request<ImportPresignResponse>(
    "/uploads/import-presign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function importTripFromPhotos(payload: {
  session_id: string;
  object_keys: string[];
}): Promise<TripImportResponse> {
  return request<TripImportResponse>(
    "/trips/import-from-photos",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    API_BASE_PUBLIC,
  );
}

export function addMediaToTrip(
  tripId: string,
  objectKeys: string[],
): Promise<TripAddMediaResponse> {
  return request<TripAddMediaResponse>(
    `/trips/${tripId}/add-media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object_keys: objectKeys }),
    },
    API_BASE_PUBLIC,
  );
}

export function triggerStoriesExport(tripId: string): Promise<StoryExportJob> {
  return request<StoryExportJob>(
    `/trips/${tripId}/stories/export`,
    { method: "POST" },
    API_BASE_PUBLIC,
  );
}

export function fetchStoriesExportJob(tripId: string, jobId: string): Promise<StoryExportJob> {
  return request<StoryExportJob>(
    `/trips/${tripId}/stories/export/${jobId}`,
    undefined,
    API_BASE_PUBLIC,
  );
}
