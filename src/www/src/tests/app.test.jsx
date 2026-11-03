import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import App from "../App";
import { api } from "../api/client";

vi.mock("../api/client", () => ({
  api: Object.fromEntries(
    [
      "getSession",
      "getRememberMe",
      "getLang",
      "login",
      "logout",
      "getClients",
      "createClient",
      "deleteClient",
      "enableClient",
      "disableClient",
      "updateClientName",
      "updateClientExpireDate",
      "updateClientTags",
      "updateClientQuota",
      "resetClientQuota",
      "generateOneTimeLink",
      "backup",
      "restore",
      "getAudit",
      "getUiTrafficStats",
      "getUiChartType",
      "getOneTimeLinksEnabled",
      "getSortClientsEnabled",
      "getAvatarSettings",
      "qrCodeUrl",
      "configurationUrl",
    ].map((name) => [name, vi.fn()]),
  ),
}));

const alice = {
  id: "a",
  name: "Alice iPhone",
  address: "10.8.0.2",
  enabled: true,
  tags: ["Family"],
  latestHandshakeAt: new Date().toISOString(),
  downloadableConfig: true,
  transferRx: 500,
  transferTx: 100,
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem("lang", "en");
  api.getSession.mockResolvedValue({
    authenticated: true,
    requiresPassword: true,
  });
  api.getRememberMe.mockResolvedValue(true);
  api.getClients.mockResolvedValue([alice]);
  api.logout.mockResolvedValue({ success: true });
  api.getUiTrafficStats.mockResolvedValue(true);
  api.getUiChartType.mockResolvedValue("1");
  api.getOneTimeLinksEnabled.mockResolvedValue(true);
  api.getSortClientsEnabled.mockResolvedValue(true);
  api.getAvatarSettings.mockResolvedValue({ dicebear: null, gravatar: false });
  api.getAudit.mockResolvedValue([]);
  api.configurationUrl.mockImplementation(
    (id) => `/api/wireguard/client/${id}/configuration`,
  );
  api.qrCodeUrl.mockImplementation(
    (id) => `/api/wireguard/client/${id}/qrcode.svg`,
  );
});

describe("React administration journeys", () => {
  it("searches by tags, clears filters and switches to compact view", async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = await screen.findByRole("searchbox", {
      name: "Search clients",
    });
    await user.type(search, "nobody");
    expect(screen.getByText("No matching clients")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "family");
    expect(
      screen.getByRole("heading", { name: alice.name }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Compact view" }));
    expect(localStorage.getItem("clientView")).toBe("list");
  });

  it("creates a client with tags, expiry and a quota", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /New Client/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "New Android");
    await user.type(within(dialog).getByLabelText("Tags"), "Work, Travel");
    await user.click(within(dialog).getByRole("button", { name: "+7 days" }));
    await user.type(within(dialog).getByLabelText("Traffic limit, GB"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "New Android",
          tags: ["Work", "Travel"],
          quotaBytes: 10 * 1024 ** 3,
          expiredDate: expect.any(String),
          quotaCycleDays: 30,
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("retains the edit dialog and shows an API failure instead of pretending to save", async () => {
    api.updateClientQuota.mockRejectedValue(
      new Error("Quota could not be saved"),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /Client actions/ }),
    );
    await user.click(screen.getByRole("button", { name: /Edit client/i }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(
      await screen.findByText("Quota could not be saved"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("requires confirmation for deletion and performs bulk disable", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("checkbox", { name: `Select ${alice.name}` }),
    );
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() => expect(api.disableClient).toHaveBeenCalledWith("a"));
    await user.click(screen.getByRole("button", { name: /Client actions/ }));
    await user.click(screen.getByRole("button", { name: "Delete Client" }));
    expect(api.deleteClient).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete Client" }),
    );
    await waitFor(() => expect(api.deleteClient).toHaveBeenCalledWith("a"));
  });

  it("disables QR/download without a private key", async () => {
    api.getClients.mockResolvedValue([{ ...alice, downloadableConfig: false }]);
    render(<App />);
    const qr = await screen.findByRole("button", { name: "Show QR Code" });
    expect(qr).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: /Download/ }),
    ).not.toBeInTheDocument();
  });

  it("supports login and clears client data immediately on logout", async () => {
    api.getSession.mockResolvedValue({
      authenticated: false,
      requiresPassword: true,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      await screen.findByLabelText("Password"),
      "example-password",
    );
    await user.click(screen.getByRole("checkbox", { name: "Remember me" }));
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByRole("heading", { name: alice.name });
    expect(api.login).toHaveBeenCalledWith("example-password", true);
    await user.click(screen.getByRole("button", { name: "Logout" }));
    expect(
      screen.queryByRole("heading", { name: alice.name }),
    ).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
  });

  it("keeps restore confirmation open and reports a server-side failure", async () => {
    api.restore.mockRejectedValue(
      new Error("Restore rejected: invalid parameters"),
    );
    const user = userEvent.setup();
    render(<App />);
    const input = await screen.findByLabelText("Restore");
    const file = new File(["{}"], "wg0.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: async () => JSON.stringify({ server: {}, clients: {} }),
    });
    await user.upload(input, file);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(
      await screen.findByText("Restore rejected: invalid parameters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
