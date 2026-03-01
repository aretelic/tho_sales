const CAPSULE_BASE = 'https://api.capsulecrm.com/api/v2';

async function capsuleFetch(path, options = {}) {
  const res = await fetch(`${CAPSULE_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CAPSULE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Capsule API error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function searchParties(email) {
  const data = await capsuleFetch(`/parties/search?q=${encodeURIComponent(email)}&embed=opportunities`);
  return data.parties || [];
}

export async function logNote(content, { partyId, opportunityId }) {
  const body = {
    entry: {
      type: 'note',
      content,
      activityType: -1,
      ...(partyId ? { party: { id: partyId } } : {}),
      ...(opportunityId ? { opportunity: { id: opportunityId } } : {}),
    },
  };
  return capsuleFetch('/entries', { method: 'POST', body: JSON.stringify(body) });
}
