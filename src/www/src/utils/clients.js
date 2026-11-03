export const DAY = 86400000;
export const totalTraffic = (client) =>
  (client.transferRx || 0) + (client.transferTx || 0);
export const isExpiring = (client, now = Date.now()) => {
  const end = Date.parse(client.expiredAt);
  return end > now && end <= now + 7 * DAY;
};
export function accessStatus(client, now = Date.now()) {
  if (client.quotaExceeded) return "quota";
  if (
    client.isExpired ||
    (client.expiredAt && Date.parse(client.expiredAt) <= now)
  )
    return "expired";
  return client.enabled ? "active" : "disabled";
}
export function isOnline(client, now = Date.now()) {
  const time = new Date(client.latestHandshakeAt).getTime();
  return (
    accessStatus(client, now) === "active" &&
    time > 0 &&
    time <= now &&
    now - time <= 180000
  );
}
export function filterClients(
  clients,
  { query = "", tags = [], status = "all" } = {},
  now = Date.now(),
) {
  const text = query.trim().toLocaleLowerCase();
  return clients.filter((client) => {
    if (
      text &&
      ![client.name, client.address, ...(client.tags || [])].some((value) =>
        String(value).toLocaleLowerCase().includes(text),
      )
    )
      return false;
    if (!tags.every((tag) => (client.tags || []).includes(tag))) return false;
    if (status === "all") return true;
    if (status === "online") return isOnline(client, now);
    if (status === "offline")
      return accessStatus(client, now) === "active" && !isOnline(client, now);
    if (status === "expiring") return isExpiring(client, now);
    return accessStatus(client, now) === status;
  });
}
export function sortClients(clients, sort = "name") {
  return [...clients].sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (sort === "traffic")
      return totalTraffic(b) - totalTraffic(a) || nameOrder;
    if (sort === "recent")
      return (
        (Date.parse(b.latestHandshakeAt) || 0) -
          (Date.parse(a.latestHandshakeAt) || 0) || nameOrder
      );
    if (sort === "expiry")
      return (
        (Date.parse(a.expiredAt) || Infinity) -
          (Date.parse(b.expiredAt) || Infinity) || nameOrder
      );
    return sort === "name-desc" ? -nameOrder : nameOrder;
  });
}
