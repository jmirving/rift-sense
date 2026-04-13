export async function authenticateWithNexusAccount({ config, email, password, fetchImpl = fetch }) {
  const response = await fetchImpl(config.auth.appLoginUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.auth.exchangeSecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}
