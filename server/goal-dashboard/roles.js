export function normalizeRoleForStorage(role) {
  const normalized = String(role ?? "").trim();
  if (/^(adc|bottom)$/i.test(normalized)) {
    return "Bot";
  }
  return normalized || "Bot";
}

export function roleLabel(role) {
  const normalized = normalizeRoleForStorage(role);
  return normalized === "ANY" ? "Any role" : normalized;
}
