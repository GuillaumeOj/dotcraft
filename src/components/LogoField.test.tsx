import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LogoField } from "./LogoField";

const LOGO = "data:image/png;base64,aaaa";
const pngFile = (name = "logo.png") =>
  new File(["logo-bytes"], name, { type: "image/png" });

/** Fire a native-style drop carrying `file` on `el`. */
function dropFile(el: Element, file: File | null) {
  const dataTransfer = { files: file ? [file] : [] };
  fireEvent.dragOver(el, { dataTransfer });
  fireEvent.drop(el, { dataTransfer });
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("LogoField — empty state", () => {
  it("imports a picked file as a data URL", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<LogoField logo={null} onChange={onChange} />);
    await user.upload(fileInput(container), pngFile());
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:/)),
    );
  });

  it("imports a dropped file immediately, without confirmation", async () => {
    const onChange = vi.fn();
    render(<LogoField logo={null} onChange={onChange} />);
    dropFile(screen.getByRole("button"), pngFile());
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:/)),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores a dropped non-image file", async () => {
    const onChange = vi.fn();
    render(<LogoField logo={null} onChange={onChange} />);
    dropFile(
      screen.getByRole("button"),
      new File(["x"], "notes.txt", { type: "text/plain" }),
    );
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("LogoField — filled state", () => {
  it("shows the logo and the change/delete actions", () => {
    render(<LogoField logo={LOGO} onChange={vi.fn()} />);
    expect(screen.getByAltText("logo preview")).toHaveAttribute("src", LOGO);
    expect(
      screen.getByRole("button", { name: "Change logo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove logo" }),
    ).toBeInTheDocument();
  });

  it("removes the logo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LogoField logo={LOGO} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("change action opens the picker and applies directly", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<LogoField logo={LOGO} onChange={onChange} />);
    // The pencil triggers the hidden input; upload simulates the chosen file.
    await user.upload(fileInput(container), pngFile("new.png"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:/)),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dropping over an existing logo asks to confirm before replacing", async () => {
    const onChange = vi.fn();
    const { container } = render(<LogoField logo={LOGO} onChange={onChange} />);
    dropFile(container.querySelector(".logo-dropzone") as Element, pngFile());
    const dialog = await screen.findByRole("dialog");
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Replace" }),
    );
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:/));
  });

  it("cancelling the replacement keeps the current logo", async () => {
    const onChange = vi.fn();
    const { container } = render(<LogoField logo={LOGO} onChange={onChange} />);
    dropFile(container.querySelector(".logo-dropzone") as Element, pngFile());
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
