import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ColorFormat } from "../qr/color";
import { DEFAULT_OPTIONS, type QrOptions } from "../qr/types";
import {
  ContentPanel,
  EditorActions,
  LogoPanel,
  SettingsPanel,
  StylePanel,
} from "./Controls";

/** Renders all editor panels together, the way App lays them out, so a single
 *  setup exercises every panel through one tree. */
function Controls({
  options,
  colorFormat,
  onColorFormatChange,
  onChange,
  onRandomize,
  onReset,
}: {
  options: QrOptions;
  colorFormat: ColorFormat;
  onColorFormatChange: (format: ColorFormat) => void;
  onChange: (patch: Partial<QrOptions>) => void;
  onRandomize: () => void;
  onReset: () => void;
}) {
  // Render the foldable panels in their always-open (desktop) form, the way
  // these tests exercise their fields; folding is covered in CollapsiblePanel.
  const fold = { collapsible: false, collapsed: false, onToggle: () => {} };
  return (
    <section>
      <ContentPanel options={options} onChange={onChange} {...fold} />
      <SettingsPanel
        options={options}
        colorFormat={colorFormat}
        onColorFormatChange={onColorFormatChange}
        onChange={onChange}
      />
      <StylePanel
        options={options}
        colorFormat={colorFormat}
        onChange={onChange}
        {...fold}
      />
      <LogoPanel
        options={options}
        colorFormat={colorFormat}
        onChange={onChange}
        {...fold}
      />
      <EditorActions onRandomize={onRandomize} onReset={onReset} />
    </section>
  );
}

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
  it("switches the active content tab", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    await user.click(screen.getByRole("tab", { name: "Text" }));
    expect(onChange).toHaveBeenLastCalledWith({ contentType: "text" });
  });

  it("edits the active content draft, preserving the others", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({
      contentType: "text",
      contents: {
        ...DEFAULT_OPTIONS.contents,
        text: { type: "text", text: "" },
      },
    });
    await user.type(screen.getByLabelText("Text"), "Q");
    expect(onChange).toHaveBeenLastCalledWith({
      contents: {
        ...DEFAULT_OPTIONS.contents,
        text: { type: "text", text: "Q" },
      },
    });
  });

  it("changes dot and eye styles via the swatch pickers", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const dots = screen.getByRole("radiogroup", { name: "Dot style" });
    await user.click(within(dots).getByRole("radio", { name: /square/i }));
    expect(onChange).toHaveBeenCalledWith({ dotStyle: "square" });
    const eyes = screen.getByRole("radiogroup", { name: "Eye style" });
    await user.click(within(eyes).getByRole("radio", { name: /circle/i }));
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
  it("offers friendly labels and defaults to Automatic", () => {
    setup({ errorCorrection: "auto" });
    const select = screen.getByLabelText(
      "Error correction",
    ) as HTMLSelectElement;
    expect(select.value).toBe("auto");
    expect(
      screen.getByRole("option", { name: "Automatic" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Quartile" }),
    ).toBeInTheDocument();
    // The description line reflects the selected setting.
    expect(screen.getByText(/Picks the best level/i)).toBeInTheDocument();
  });

  it("emits the chosen level when no logo is set", async () => {
    const user = userEvent.setup();
    const { onChange } = setup({ logo: null, errorCorrection: "M" });
    const select = screen.getByLabelText("Error correction");
    expect(select).not.toBeDisabled();
    await user.selectOptions(select, "Q");
    expect(onChange).toHaveBeenCalledWith({ errorCorrection: "Q" });
  });

  it("is disabled and shows the forced-High hint while a logo is set", () => {
    setup({ logo: LOGO, errorCorrection: "M" });
    expect(screen.getByLabelText("Error correction")).toBeDisabled();
    expect(
      screen.getByText(/error correction is forced to High/i),
    ).toBeInTheDocument();
  });
});

describe("Controls — logo", () => {
  it("wires the logo dropzone to patch the logo option", async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["logo-bytes"], "logo.png", { type: "image/png" });
    await user.upload(input, file);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ logo: expect.stringMatching(/^data:/) }),
      ),
    );
  });

  it("hides the sizing controls until a logo is present", () => {
    setup({ logo: null });
    expect(screen.queryByRole("button", { name: "Remove logo" })).toBeNull();
    expect(screen.queryByText(/Corner radius/)).toBeNull();
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
