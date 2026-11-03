import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { useClients } from "../state/useClients";
import { SessionProvider, useSession } from "../state/Session";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    getClients: vi.fn(),
    getSession: vi.fn(),
    getRememberMe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("client polling lifecycle", () => {
  it("does not overlap slow polling requests and ignores a response after logout", async () => {
    vi.useFakeTimers();
    let resolve;
    api.getClients.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result, rerender } = renderHook(
      ({ active }) => useClients(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(api.getClients).toHaveBeenCalledTimes(1);
    rerender({ active: false });
    await act(async () => {
      resolve([{ id: "secret-client", transferRx: 0, transferTx: 0 }]);
    });
    expect(result.current.clients).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(api.getClients).toHaveBeenCalledTimes(1);
  });
  it("retains useful errors, supports retry, and resets traffic history on counter reset", async () => {
    api.getClients.mockRejectedValueOnce(new Error("Server unavailable"));
    const { result } = renderHook(() => useClients(true));
    await waitFor(() =>
      expect(result.current.error).toBe("Server unavailable"),
    );
    api.getClients.mockResolvedValue([
      { id: "a", transferRx: 500, transferTx: 0 },
    ]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe("");
    expect(result.current.clients[0].transferRxCurrent).toBe(0);
    api.getClients.mockResolvedValue([
      { id: "a", transferRx: 0, transferTx: 0 },
    ]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.clients[0].transferRxCurrent).toBe(0);
  });
});

describe("sessions", () => {
  it("supports passwordless deployment and returns to login on 401", async () => {
    api.getSession.mockResolvedValue({
      authenticated: true,
      requiresPassword: false,
    });
    api.getRememberMe.mockResolvedValue(false);
    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    act(() => window.dispatchEvent(new CustomEvent("api:unauthorized")));
    expect(result.current.authenticated).toBe(false);
  });
  it("clears local auth immediately when logout is slow", async () => {
    api.getSession.mockResolvedValue({
      authenticated: true,
      requiresPassword: true,
    });
    api.getRememberMe.mockResolvedValue(true);
    api.logout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSession(), {
      wrapper: SessionProvider,
    });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    act(() => {
      result.current.logout();
    });
    expect(result.current.authenticated).toBe(false);
  });
});
