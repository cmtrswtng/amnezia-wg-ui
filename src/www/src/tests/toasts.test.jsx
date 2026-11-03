import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { I18nProvider } from "../state/i18n";
import { ToastProvider, useToasts } from "../state/Toasts";

afterEach(() => vi.unstubAllGlobals());
function Harness() {
  const toasts = useToasts();
  return (
    <>
      <button onClick={() => toasts.success("Saved successfully")}>Save</button>
      <button onClick={() => toasts.error("Connection failed")}>Fail</button>
    </>
  );
}
it("shows success and errors on ordinary HTTP without crypto.randomUUID", async () => {
  localStorage.setItem("lang", "en");
  vi.stubGlobal("crypto", { randomUUID: undefined });
  const user = userEvent.setup();
  render(
    <I18nProvider>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </I18nProvider>,
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Saved successfully")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Fail" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection failed",
  );
});
