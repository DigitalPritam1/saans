/**
 * Client API Service for Saans
 * Communicates exclusively with Express backend proxies
 */

export async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Failed to load configuration');
    return await res.json();
  } catch (err) {
    console.warn('[Saans API] Config fetch failed:', err);
    return { mapsApiKey: '' };
  }
}

export async function fetchAqi(lat, lng) {
  const url = `/api/aqi?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error = new Error(errData.error || `Failed to fetch air quality data (${res.status})`);
    error.status = res.status;
    error.details = errData.details;
    throw error;
  }
  return await res.json();
}

export async function fetchPlan(profile, aqi) {
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, aqi })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error = new Error(errData.error || `Failed to generate smog action plan (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return await res.json();
}

export async function sendChatMessage(message, profile, aqi, lang = 'en') {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, profile, aqi, lang })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const error = new Error(errData.error || `Chat response failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return await res.json();
}
