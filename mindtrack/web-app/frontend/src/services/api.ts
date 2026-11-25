import type {
  AdminOverviewResponse,
  AdminUserRow,
  AnalysisRunResponse,
  AudioConversionResult,
  AuthSessionResponse,
  AuthStatusResponse,
  BaselinesResponse,
  BaselineSummaryData,
  CheckinComparisonReport,
  CheckinSession,
  DashboardResponse,
  FaceAnalysisResult,
  HealthStatus,
  OperationalMode,
  QuestionnairePayload,
  UserProfile,
  UserRole,
  VoiceAnalysisResult,
} from "../types/mindtrack";

const API_BASE = "/api/v1";

// Ephemeral in-memory access token only (never persisted to localStorage/sessionStorage)
let inMemoryAccessToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setUnauthorizedHandler(cb: (() => void) | null): void {
  onUnauthorizedCallback = cb;
}

function buildAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (inMemoryAccessToken) {
    headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return headers;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = buildAuthHeaders(
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined),
  );
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (res.status === 401 && inMemoryAccessToken && !path.startsWith("/auth/login")) {
    onUnauthorizedCallback?.();
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data?.detail)) {
        message = data.detail.map((e: { msg?: string }) => e.msg || JSON.stringify(e)).join("; ");
      }
    } catch {
      // ignore json parse failure
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// Health
export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthStatus>(res);
}

// Auth
export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const res = await fetch(`${API_BASE}/auth/status`);
  return handleResponse<AuthStatusResponse>(res);
}

export async function bootstrapAdmin(payload: {
  email: string;
  fullName: string;
  password: string;
  id?: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(`${API_BASE}/auth/bootstrap-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthSessionResponse>(res);
}

export async function registerUser(payload: {
  email: string;
  fullName: string;
  password: string;
  id?: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthSessionResponse>(res);
}

export async function loginUser(payload: {
  identifier: string;
  password: string;
}): Promise<AuthSessionResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthSessionResponse>(res);
}

export async function requestForgotPassword(email: string): Promise<{
  emailDeliveryConfigured: boolean;
  status: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return handleResponse(res);
}

export async function fetchCurrentUser(): Promise<UserProfile> {
  const res = await authFetch("/auth/me");
  return handleResponse<UserProfile>(res);
}

export async function updateMyProfile(payload: {
  fullName?: string;
  email?: string;
}): Promise<UserProfile> {
  const res = await authFetch("/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<UserProfile>(res);
}

export async function changeMyPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<AuthSessionResponse & { updated: boolean }> {
  const res = await authFetch("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function logoutUser(): Promise<void> {
  try {
    await authFetch("/auth/logout", { method: "POST" });
  } catch {
    // ignore network failure on signout
  }
}

// Admin APIs
export async function fetchAdminOverview(): Promise<AdminOverviewResponse> {
  const res = await authFetch("/admin/overview");
  return handleResponse<AdminOverviewResponse>(res);
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const res = await authFetch("/admin/users");
  return handleResponse<AdminUserRow[]>(res);
}

export async function adminCreateUser(payload: {
  id?: string;
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}): Promise<UserProfile> {
  const res = await authFetch("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<UserProfile>(res);
}

export async function adminUpdateUser(
  userId: string,
  payload: {
    fullName?: string;
    email?: string;
    role?: UserRole;
    isActive?: boolean;
    newPassword?: string;
  },
): Promise<UserProfile> {
  const res = await authFetch(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<UserProfile>(res);
}

// User / Dashboard / Baselines / Check-ins
export async function fetchDashboard(userId: string): Promise<DashboardResponse> {
  const res = await authFetch(`/dashboard/${encodeURIComponent(userId)}`);
  return handleResponse<DashboardResponse>(res);
}

export async function fetchBaselines(userId: string): Promise<BaselinesResponse> {
  const res = await authFetch(`/baselines/${encodeURIComponent(userId)}`);
  return handleResponse<BaselinesResponse>(res);
}

export async function fetchBaselineSummary(userId: string): Promise<BaselineSummaryData> {
  const res = await authFetch(`/baselines/${encodeURIComponent(userId)}/summary`);
  return handleResponse<BaselineSummaryData>(res);
}

export async function resetBaseline(userId: string, modality: "face" | "voice"): Promise<{ reset: boolean }> {
  const res = await authFetch(`/baselines/${encodeURIComponent(userId)}/${modality}`, {
    method: "DELETE",
  });
  return handleResponse<{ reset: boolean }>(res);
}

export async function fetchCheckins(userId: string): Promise<CheckinSession[]> {
  const res = await authFetch(`/checkins?userId=${encodeURIComponent(userId)}`);
  return handleResponse<CheckinSession[]>(res);
}

export async function fetchCheckinReport(checkinId: string): Promise<CheckinComparisonReport> {
  const res = await authFetch(`/checkins/${encodeURIComponent(checkinId)}/report`);
  return handleResponse<CheckinComparisonReport>(res);
}

export async function deleteCheckin(checkinId: string): Promise<{ deleted: boolean }> {
  const res = await authFetch(`/checkins/${encodeURIComponent(checkinId)}`, {
    method: "DELETE",
  });
  return handleResponse<{ deleted: boolean }>(res);
}

export async function createCheckin(payload: {
  userId: string;
  questionnaire?: QuestionnairePayload | null;
  faceAnalysisRunId?: string | null;
  voiceAnalysisRunId?: string | null;
  notes?: string | null;
}): Promise<CheckinSession> {
  const res = await authFetch("/checkins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<CheckinSession>(res);
}

export async function fetchRecentRuns<T = FaceAnalysisResult | VoiceAnalysisResult>(
  userId: string,
  modality?: "FACE" | "VOICE",
): Promise<Array<AnalysisRunResponse<T>>> {
  const qs = modality ? `?modality=${modality}` : "";
  const res = await authFetch(`/analysis-runs/${encodeURIComponent(userId)}${qs}`);
  return handleResponse<Array<AnalysisRunResponse<T>>>(res);
}

export function uploadWithProgress<T>(
  endpoint: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${endpoint}`);
    if (inMemoryAccessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${inMemoryAccessToken}`);
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 90));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (onProgress) onProgress(100);
      if (xhr.status === 401 && inMemoryAccessToken) {
        onUnauthorizedCallback?.();
      }
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as T);
        } else {
          reject(new Error(parsed?.detail || `Request failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Unexpected server response (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Could not connect to the MindTrack backend service."));
    };

    xhr.send(formData);
  });
}

export async function analyzeFaceVideo(params: {
  file: File;
  userId: string;
  mode: OperationalMode;
  maxDuration: number;
  updateBaseline: boolean;
  onProgress?: (pct: number) => void;
}): Promise<AnalysisRunResponse<FaceAnalysisResult>> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("userId", params.userId);
  form.append("mode", params.mode);
  form.append("maxDuration", String(params.maxDuration));
  form.append("updateBaseline", String(params.updateBaseline));
  return uploadWithProgress<AnalysisRunResponse<FaceAnalysisResult>>("/face/analyze", form, params.onProgress);
}

export async function convertVoiceAudioToWav(params: {
  file: File;
  userId: string;
  onProgress?: (pct: number) => void;
}): Promise<AudioConversionResult> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("userId", params.userId);
  return uploadWithProgress<AudioConversionResult>("/voice/convert", form, params.onProgress);
}

export async function fetchConvertedWavBlob(conversionId: string): Promise<Blob> {
  const res = await authFetch(`/voice/converted/${encodeURIComponent(conversionId)}`);
  if (!res.ok) {
    let msg = `Failed to load converted WAV (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) msg = data.detail;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.blob();
}

export async function analyzeVoiceAudio(params: {
  file?: File;
  conversionId?: string;
  userId: string;
  mode: OperationalMode;
  updateBaseline: boolean;
  onProgress?: (pct: number) => void;
}): Promise<AnalysisRunResponse<VoiceAnalysisResult>> {
  const form = new FormData();
  if (params.conversionId) {
    form.append("conversionId", params.conversionId);
  } else if (params.file) {
    form.append("file", params.file);
  }
  form.append("userId", params.userId);
  form.append("mode", params.mode);
  form.append("updateBaseline", String(params.updateBaseline));
  return uploadWithProgress<AnalysisRunResponse<VoiceAnalysisResult>>("/voice/analyze", form, params.onProgress);
}
