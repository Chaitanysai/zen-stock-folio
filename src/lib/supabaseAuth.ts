const SUPABASE_STORAGE_KEY = "zen-stock-folio.auth.session";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

type SupabaseAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email?: string | null;
  };
};

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !apiKey) {
    return null;
  }

  return {
    url: url.endsWith("/") ? url.slice(0, -1) : url,
    apiKey,
  };
}

function mapAuthResponse(data: SupabaseAuthResponse): AuthSession {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    user: {
      id: data.user.id,
      email: data.user.email || "",
    },
  };
}

async function parseError(response: Response) {
  const fallback = `Auth request failed (${response.status})`;

  try {
    const data = await response.json();
    return data?.msg || data?.error_description || data?.error || fallback;
  } catch {
    return fallback;
  }
}

async function authRequest(path: string, init: RequestInit) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.apiKey,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response;
}

export function isSupabaseConfigured() {
  return !!getSupabaseConfig();
}

export function getStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SUPABASE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
    return null;
  }
}

export function storeSession(session: AuthSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SUPABASE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify(session));
}

export async function signInWithPassword(email: string, password: string) {
  const response = await authRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json()) as SupabaseAuthResponse;
  return mapAuthResponse(data);
}

export async function refreshSession(refreshToken: string) {
  const response = await authRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = (await response.json()) as SupabaseAuthResponse;
  return mapAuthResponse(data);
}

export async function fetchCurrentUser(accessToken: string) {
  const response = await authRequest("/auth/v1/user", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json()) as { id: string; email?: string | null };
  return {
    id: data.id,
    email: data.email || "",
  };
}

export async function signOut(accessToken: string) {
  try {
    await authRequest("/auth/v1/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    // Local session cleanup is enough for this app if the network call fails.
  }
}
