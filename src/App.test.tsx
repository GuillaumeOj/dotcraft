import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import * as storage from "./qr/storage";
import { DEFAULT_OPTIONS } from "./qr/types";

// Persistence is exercised directly in storage.test.ts; here we mock it to
// assert the App wires the editor to it correctly.
vi.mock("./qr/storage", () => ({
  loadState: vi.fn(() => null),
  saveState: vi.fn(),
  clearState: vi.fn(),
  loadLogo: vi.fn(async () => null),
  saveLogo: vi.fn(async () => {}),
  clearLogo: vi.fn(async () => {}),
}));

const mocked = vi.mocked(storage);
const LOGO = "data:image/png;base64,aaaa";

beforeEach(() => {
  vi.clearAllMocks();
  mocked.loadState.mockReturnValue(null);
  mocked.loadLogo.mockResolvedValue(null);
});

describe("App", () => {
  it("renders the editor and a live preview", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "QR Studio" }),
    ).toBeInTheDocument();
    expect(await screen.findByAltText("QR code preview")).toBeInTheDocument();
  });

  it("restores persisted settings on mount", async () => {
    mocked.loadState.mockReturnValue({
      options: { ...DEFAULT_OPTIONS, data: "restored" },
      colorFormat: "rgb",
    });
    render(<App />);
    expect(
      (screen.getByLabelText("Text or URL") as HTMLInputElement).value,
    ).toBe("restored");
    // colorFormat rgb -> RGB channel inputs are shown (one set per colour field).
    expect((await screen.findAllByLabelText("R")).length).toBeGreaterThan(0);
  });

  it("hydrates a saved logo from IndexedDB", async () => {
    mocked.loadLogo.mockResolvedValue(LOGO);
    render(<App />);
    expect(await screen.findByAltText("logo preview")).toBeInTheDocument();
    // A logo forces error correction to H + disables the control.
    expect(screen.getByLabelText("Error correction")).toBeDisabled();
  });

  it("debounces a settings save after an edit", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const input = screen.getByLabelText("Text or URL");
    await user.clear(input);
    await user.type(input, "hi");
    await waitFor(() => {
      const calls = mocked.saveState.mock.calls;
      expect(calls[calls.length - 1]?.[0].data).toBe("hi");
    });
  });

  it("clears the persisted logo when it is removed", async () => {
    mocked.loadLogo.mockResolvedValue(LOGO);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Remove logo" }),
    );
    await waitFor(() => expect(mocked.clearLogo).toHaveBeenCalled());
  });

  it("persists a newly uploaded logo", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByAltText("QR code preview");
    const file = new File(["bytes"], "logo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Image/), file);
    await waitFor(() => expect(mocked.saveLogo).toHaveBeenCalled());
  });

  it("resets to defaults and clears storage", async () => {
    mocked.loadState.mockReturnValue({
      options: { ...DEFAULT_OPTIONS, data: "to-be-reset" },
      colorFormat: "hex",
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(mocked.clearState).toHaveBeenCalledOnce();
    expect(
      (screen.getByLabelText("Text or URL") as HTMLInputElement).value,
    ).toBe(DEFAULT_OPTIONS.data);
  });

  it("randomizes the style without breaking the preview", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Randomize/ }));
    expect(screen.getByAltText("QR code preview")).toBeInTheDocument();
  });

  it("surfaces a render error when the content is emptied", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.clear(screen.getByLabelText("Text or URL"));
    expect(
      await screen.findByText(/Enter some text or a URL/i),
    ).toBeInTheDocument();
  });
});
