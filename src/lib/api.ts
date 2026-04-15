const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, port, origin } = window.location;
  const isLocalDev =
    import.meta.env.DEV &&
    protocol.startsWith("http") &&
    LOCAL_HOSTS.has(hostname) &&
    port !== "3000";

  if (isLocalDev) {
    return `${protocol}//${hostname}:3000`;
  }

  return trimTrailingSlash(origin);
}

export function getApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function getApiUnavailableMessage(feature: string) {
  return `${feature} is unavailable because the API could not be reached. Start the serverless API locally or set VITE_API_BASE_URL.`;
}
