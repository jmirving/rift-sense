export function extractCookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== "string" || !cookieHeader.trim()) {
    return null;
  }

  const cookies = cookieHeader.split(";");
  for (const entry of cookies) {
    const [rawName, ...rawValue] = entry.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    const value = decodeURIComponent(rawValue.join("=") || "").trim();
    return value || null;
  }

  return null;
}

export function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.path) {
    segments.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (Number.isInteger(options.maxAge)) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires instanceof Date) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  return segments.join("; ");
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, "", {
    ...options,
    expires: new Date(0),
    maxAge: 0
  });
}
