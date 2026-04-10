export async function redeemLaunchGrant({ config, grantId, fetchImpl = fetch }) {
  const response = await fetchImpl(config.auth.exchangeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.auth.exchangeSecret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ grantId })
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}
