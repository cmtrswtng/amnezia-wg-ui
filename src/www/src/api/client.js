export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('api:unauthorized'));
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.message || data.error || data.statusMessage || message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(message, res.status);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  getSession: () => call('GET', '/api/session'),
  login: (password, remember) => call('POST', '/api/session', { password, remember }),
  logout: () => call('DELETE', '/api/session'),
  getLang: () => call('GET', '/api/lang'),
  getRememberMe: () => call('GET', '/api/remember-me'),
  getUiTrafficStats: () => call('GET', '/api/ui-traffic-stats'),
  getUiChartType: () => call('GET', '/api/ui-chart-type'),
  getOneTimeLinksEnabled: () => call('GET', '/api/wg-enable-one-time-links'),
  getSortClientsEnabled: () => call('GET', '/api/ui-sort-clients'),
  getAvatarSettings: () => call('GET', '/api/ui-avatar-settings'),

  getClients: () => call('GET', '/api/wireguard/client'),
  createClient: ({ name, expiredDate, tags, quotaBytes, quotaCycleDays }) => call('POST', '/api/wireguard/client', { name, expiredDate, tags, quotaBytes, quotaCycleDays }),
  deleteClient: (id) => call('DELETE', `/api/wireguard/client/${id}`),
  enableClient: (id) => call('POST', `/api/wireguard/client/${id}/enable`),
  disableClient: (id) => call('POST', `/api/wireguard/client/${id}/disable`),
  updateClientName: (id, name) => call('PUT', `/api/wireguard/client/${id}/name`, { name }),
  updateClientExpireDate: (id, expireDate) => call('PUT', `/api/wireguard/client/${id}/expireDate`, { expireDate }),
  updateClientTags: (id, tags) => call('PUT', `/api/wireguard/client/${id}/tags`, { tags }),
  updateClientQuota: (id, { quotaBytes, quotaCycleDays }) => call('PUT', `/api/wireguard/client/${id}/quota`, { quotaBytes, quotaCycleDays }),
  resetClientQuota: (id) => call('POST', `/api/wireguard/client/${id}/quotaReset`),
  generateOneTimeLink: (id) => call('POST', `/api/wireguard/client/${id}/generateOneTimeLink`),
  backup: () => call('GET', '/api/wireguard/backup'),
  restore: (file) => call('PUT', '/api/wireguard/restore', { file }),

  qrCodeUrl: (id) => `/api/wireguard/client/${id}/qrcode.svg`,
  configurationUrl: (id) => `/api/wireguard/client/${id}/configuration`,
};
