import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ColorFormat } from "../qr/color";
import { DEFAULT_OPTIONS, type QrOptions } from "../qr/types";
import { Controls } from "./Controls";

function setup(
  over: Partial<QrOptions> = {},
  opts: { colorFormat?: ColorFormat } = {},
) {
  const onChange = vi.fn();
  const onColorFormatChange = vi.fn();
  const onRandomize = vi.fn();
  const onReset = vi.fn();
  render(
    <Controls
      options={{ ...DEFAULT_OPTIONS, ...over }}
      colorFormat={opts.colorFormat ?? "hex"}
      onColorFormatChange={onColorFormatChange}
      onChange={onChange}
      onRandomize={onRandomize}
      onReset={onReset}
    />,
  );
  return { onChange, onColorFormatChange, onRandomize, onReset };
}

const LOGO = "data:image/png;base64,aaaa";

describe("Controls — content & style", () => {
  it("edits the encoded text", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ data: "" });
    await user.type(screen.getByLabelText("Text or URL"), "Q");
    expect(onChange).toHaveBeenLastCalledWith({ data: "Q" });
  });

  it("changes dot and eye styles", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.selectOptions(screen.getByLabelText("Dot style"), "square");
    expect(onChange).toHaveBeenCalledWith({ dotStyle: "square" });
    await user.selectOptions(screen.getByLabelText("Eye style"), "circle");
    expect(onChange).toHaveBeenCalledWith({ eyeStyle: "circle" });
  });

  it("changes the colour-entry format", async () => {
    const user = userEvent.setup();
    const { onColorFormatChange } = setup();
    // The select shows human labels via getLabel.
    expect(screen.getByRole("option", { name: "RGB" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Colour format"), "RGB");
    expect(onColorFormatChange).toHaveBeenCalledWith("rgb");
  });

  it("edits foreground and background colours", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.clear(screen.getByLabelText("Foreground"));
    await user.type(screen.getByLabelText("Foreground"), "abcdef");
    expect(onChange).toHaveBeenCalledWith({ fillColor: "#abcdef" });
  });

  it("edits the quiet-zone margin", () => {
    const { onChange } = setup({ margin: 4 });
    expect(screen.getByText(/Quiet-zone margin.*·.*4/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Quiet-zone margin/), {
      target: { value: "6" },
    });
    expect(onChange).toHaveBeenCalledWith({ margin: 6 });
  });
});

describe("Controls — error correction", () => {
  it("emits the chosen level when no logo is set", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ logo: null, errorCorrection: "M" });
    const select = screen.getByLabelText("Error correction");
    expect(select).not.toBeDisabled();
    await user.selectOptions(select, "Q");
    expect(onChange).toHaveBeenCalledWith({ errorCorrection: "Q" });
  });

  it("is forced to H and disabled while a logo is set", () => {
    setup({ logo: LOGO, errorCorrection: "M" });
    const select = screen.getByLabelText(
      "Error correction",
    ) as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(select.value).toBe("H");
    expect(
      screen.getByText(/error correction is forced to H/i),
    ).toBeInTheDocument();
  });
});

describe("Controls — logo", () => {
  it("reads an uploaded file into a data URL", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const file = new File(["logo-bytes"], "logo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Image/), file);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ logo: expect.stringMatching(/^data:/) }),
      ),
    );
  });

  it("hides logo controls until a logo is present", () => {
    setup({ logo: null });
    expect(screen.queryByRole("button", { name: "Remove logo" })).toBeNull();
  });

  it("shows logo controls and removes the logo", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ logo: LOGO });
    expect(screen.getByAltText("logo preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(onChange).toHaveBeenCalledWith({ logo: null });
  });

  it("adjusts logo size, padding and corner radius", () => {
    const { onChange } = setup({
      logo: LOGO,
      logoRatio: 0.25,
      logoPadding: 0.12,
      logoRadius: 0.2,
    });
    expect(screen.getByText(/Size.*·.*25%/)).toBeInTheDocument();
    expect(screen.getByText(/Padding.*·.*12%/)).toBeInTheDocument();
    expect(screen.getByText(/Corner radius.*·.*20%/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Size/), {
      target: { value: "0.4" },
    });
    expect(onChange).toHaveBeenCalledWith({ logoRatio: 0.4 });
    fireEvent.change(screen.getByLabelText(/Padding/), {
      target: { value: "0.2" },
    });
    expect(onChange).toHaveBeenCalledWith({ logoPadding: 0.2 });
    fireEvent.change(screen.getByLabelText(/Corner radius/), {
      target: { value: "0.5" },
    });
    expect(onChange).toHaveBeenCalledWith({ logoRadius: 0.5 });
  });

  it("edits the logo background colour", () => {
    const { onChange } = setup({ logo: LOGO, logoBg: "#ffffff" });
    fireEvent.change(screen.getByLabelText("Logo background swatch"), {
      target: { value: "#123456" },
    });
    expect(onChange).toHaveBeenCalledWith({ logoBg: "#123456" });
  });

  it("toggles a transparent logo background on", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ logo: LOGO, logoBg: "#ffffff" });
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ logoBg: "none" });
  });

  it("toggles a transparent logo background off", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ logo: LOGO, logoBg: "none" });
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    // While transparent, the colour field shows the fallback white.
    expect(
      (screen.getByLabelText("Logo background") as HTMLInputElement).value,
    ).toBe("ffffff");
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ logoBg: "#ffffff" });
  });
});

describe("Controls — actions", () => {
  it("randomizes and resets", async () => {
    const user = userEvent.setup();
    const { onRandomize, onReset } = setup();
    await user.click(screen.getByRole("button", { name: /Randomize/ }));
    expect(onRandomize).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
