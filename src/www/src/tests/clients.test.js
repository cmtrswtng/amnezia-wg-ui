import { describe, it, expect } from "vitest";
import {
  isOnline,
  accessStatus,
  filterClients,
  sortClients,
} from "../utils/clients";

const now = Date.parse("2026-11-03T12:00:00Z");
const alice = {
  id: "a",
  name: "Alice iPhone",
  address: "10.8.0.2",
  enabled: true,
  tags: ["Family"],
  latestHandshakeAt: new Date(now - 30000).toISOString(),
  transferRx: 300,
  expiredAt: new Date(now + 86400000).toISOString(),
};
const bob = {
  id: "b",
  name: "Bob Linux",
  address: "10.8.0.3",
  enabled: true,
  tags: ["Work"],
  latestHandshakeAt: null,
  transferRx: 0,
  expiredAt: null,
};

describe("client search and connection model", () => {
  it("matches name, IP, and tags ignoring case and whitespace", () => {
    for (const query of [" IPHONE ", "10.8.0.2", "fAmIlY"])
      expect(filterClients([alice, bob], { query }, now)).toEqual([alice]);
  });
  it("combines text, tags, and real connection status", () => {
    expect(
      filterClients(
        [alice, bob],
        { query: "10.8", tags: ["Family"], status: "online" },
        now,
      ),
    ).toEqual([alice]);
    expect(
      filterClients([alice, bob], { tags: ["Work"], status: "online" }, now),
    ).toEqual([]);
  });
  it("never treats permission as an active connection, or future/invalid dates as online", () => {
    expect(isOnline(alice, now)).toBe(true);
    for (const latestHandshakeAt of [
      null,
      0,
      "invalid",
      new Date(now + 1000).toISOString(),
      new Date(now - 181000).toISOString(),
    ]) {
      expect(isOnline({ ...alice, latestHandshakeAt }, now)).toBe(false);
    }
    expect(isOnline({ ...alice, enabled: false }, now)).toBe(false);
    expect(isOnline({ ...alice, quotaExceeded: true }, now)).toBe(false);
  });
  it("prioritizes expired and quota state over permission and evaluates expiry as time passes", () => {
    expect(
      accessStatus(
        { ...alice, expiredAt: new Date(now - 1).toISOString() },
        now,
      ),
    ).toBe("expired");
    expect(accessStatus({ ...alice, quotaExceeded: true }, now)).toBe("quota");
    expect(filterClients([alice, bob], { status: "expiring" }, now)).toEqual([
      alice,
    ]);
    expect(filterClients([alice, bob], { status: "offline" }, now)).toEqual([
      bob,
    ]);
  });
  it("sorts by traffic and expiry, putting permanent access last without mutating input", () => {
    const source = [bob, alice];
    expect(sortClients(source, "traffic").map((c) => c.id)).toEqual(["a", "b"]);
    expect(sortClients(source, "expiry").map((c) => c.id)).toEqual(["a", "b"]);
    expect(source).toEqual([bob, alice]);
    expect(sortClients(source, "recent").map((c) => c.id)).toEqual(["a", "b"]);
  });
});
