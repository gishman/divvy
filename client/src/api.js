/**
 * API client with authentication, token storage, and JSON request handling.
 */

const TOKEN_KEY = 'divvy_auth_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function request(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(path, config);
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

// ------------------------------------------------------------- Auth
export const api = {
  auth: {
    register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
    login: (identifier) => request('/api/auth/login', { method: 'POST', body: { identifier } }),
    verify: (payload) => request('/api/auth/verify', { method: 'POST', body: payload }),
    me: () => request('/api/auth/me'),
    updateMe: (name) => request('/api/auth/me', { method: 'PATCH', body: { name } }),
  },

  contacts: {
    list: () => request('/api/contacts'),
    lookup: (q) => request(`/api/contacts/lookup?q=${encodeURIComponent(q)}`),
    create: (payload) => request('/api/contacts', { method: 'POST', body: payload }),
    update: (id, payload) => request(`/api/contacts/${id}`, { method: 'PUT', body: payload }),
    delete: (id) => request(`/api/contacts/${id}`, { method: 'DELETE' }),
  },

  divvys: {
    list: () => request('/api/divvys'),
    get: (id) => request(`/api/divvys/${id}`),
    create: (payload) => request('/api/divvys', { method: 'POST', body: payload }),
    join: (id) => request(`/api/divvys/${id}/join`, { method: 'POST' }),
    delete: (id) => request(`/api/divvys/${id}`, { method: 'DELETE' }),
    updateReceipt: (id, payload) => request(`/api/divvys/${id}/receipt`, { method: 'PUT', body: payload }),
    addParty: (id, payload) => request(`/api/divvys/${id}/parties`, { method: 'POST', body: payload }),
    removeParty: (id, partyId) => request(`/api/divvys/${id}/parties/${partyId}`, { method: 'DELETE' }),
    setPaid: (id, partyId, paid) => request(`/api/divvys/${id}/parties/${partyId}`, { method: 'PATCH', body: { paid } }),
    addAllocations: (id, allocations) => request(`/api/divvys/${id}/allocations`, { method: 'POST', body: { allocations } }),
    deleteAllocation: (id, allocId) => request(`/api/divvys/${id}/allocations/${allocId}`, { method: 'DELETE' }),
    clearAllocations: (id, payload) => request(`/api/divvys/${id}/allocations/clear`, { method: 'POST', body: payload }),
  },

  ocr: {
    scanServer: async (file) => {
      const token = getStoredToken();
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Server OCR failed');
      return data;
    },
  },
};
