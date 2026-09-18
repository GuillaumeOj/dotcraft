import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ColorFormat } from "../qr/color";
import {
  ColorField,
  CountrySelect,
  Field,
  PhoneField,
  RangeField,
  SelectField,
  TextAreaField,
  TextField,
} from "./fields";

describe("Field", () => {
  it("associates the label with the control it renders", () => {
    render(<Field label="My field">{(id) => <input id={id} />}</Field>);
    // getByLabelText only resolves if htmlFor/id are correctly wired.
    expect(screen.getByLabelText("My field")).toBeInTheDocument();
  });
});

describe("TextField", () => {
  it("renders the value and reports edits", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TextField
        label="Text"
        value="hi"
        placeholder="type here"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Text") as HTMLInputElement;
    expect(input.value).toBe("hi");
    expect(input.placeholder).toBe("type here");
    await user.type(input, "x");
    expect(onChange).toHaveBeenLastCalledWith("hix");
  });
});

describe("SelectField", () => {
  it("capitalises plain option labels and emits the raw value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField
        label="Style"
        value="square"
        options={["square", "circle"] as const}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("option", { name: "Square" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Style"), "circle");
    expect(onChange).toHaveBeenCalledWith("circle");
  });

  it("supports a custom label renderer and a disabled state", () => {
    render(
      <SelectField
        label="Fmt"
        value="a"
        options={["a", "b"] as const}
        onChange={() => {}}
        getLabel={(v) => `opt-${v}`}
        disabled
      />,
    );
    expect(screen.getByRole("option", { name: "opt-a" })).toBeInTheDocument();
    expect(screen.getByLabelText("Fmt")).toBeDisabled();
  });
});

describe("RangeField", () => {
  it("shows the formatted value in the label and emits a number", () => {
    const onChange = vi.fn();
    render(
      <RangeField
        label="Size"
        value={0.25}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/Size.*25%/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Size/), {
      target: { value: "0.5" },
    });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("falls back to the raw value when no formatter is given", () => {
    render(
      <RangeField
        label="Margin"
        value={4}
        min={0}
        max={8}
        step={1}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Margin.*·.*4/)).toBeInTheDocument();
  });
});

// A stateful host so onChange feeds back into `value`, mirroring real usage and
// letting useColorDraft settle the way it does in the app.
function ColorHost({
  initial,
  format,
}: {
  initial: string;
  format: ColorFormat;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ColorField
        label="Colour"
        value={value}
        format={format}
        onChange={setValue}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const currentValue = () => screen.getByTestId("value").textContent;

describe("ColorField — swatch", () => {
  it("seeds the native swatch from the current colour", () => {
    render(<ColorHost initial="tomato" format="hex" />);
    const swatch = screen.getByLabelText("Colour swatch") as HTMLInputElement;
    expect(swatch.value).toBe("#ff6347");
  });

  it("falls back to black when the colour can't be parsed", () => {
    render(<ColorHost initial="garbage" format="hex" />);
    const swatch = screen.getByLabelText("Colour swatch") as HTMLInputElement;
    expect(swatch.value).toBe("#000000");
  });

  it("emits the picked colour on swatch change", () => {
    render(<ColorHost initial="#000000" format="hex" />);
    const swatch = screen.getByLabelText("Colour swatch");
    // <input type=color> isn't typeable; fireEvent.change drives React's onChange.
    fireEvent.change(swatch, { target: { value: "#112233" } });
    expect(currentValue()).toBe("#112233");
  });
});

describe("ColorField — hex format", () => {
  it("shows the hex digits without the leading #", () => {
    render(<ColorHost initial="#abcdef" format="hex" />);
    const hex = screen.getByLabelText("Hex value") as HTMLInputElement;
    expect(hex.value).toBe("abcdef");
  });

  it("commits a full 6-digit hex value", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#000000" format="hex" />);
    const hex = screen.getByLabelText("Hex value");
    await user.clear(hex);
    await user.type(hex, "abcdef");
    expect(currentValue()).toBe("#abcdef");
  });

  it("strips non-hex characters as you type", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#000000" format="hex" />);
    const hex = screen.getByLabelText("Hex value") as HTMLInputElement;
    await user.clear(hex);
    await user.type(hex, "gg12zz");
    expect(hex.value).toBe("12");
  });

  it("marks an incomplete value invalid and skips emitting it", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#000000" format="hex" />);
    const hex = screen.getByLabelText("Hex value") as HTMLInputElement;
    await user.clear(hex);
    await user.type(hex, "ab");
    expect(hex).toHaveAttribute("aria-invalid", "true");
    // "#000000" never re-emitted as a half-typed value.
    expect(currentValue()).toBe("#000000");
  });
});

describe("ColorField — rgb format", () => {
  it("decodes the colour into R/G/B channels", () => {
    render(<ColorHost initial="#0080ff" format="rgb" />);
    expect((screen.getByLabelText("R") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("G") as HTMLInputElement).value).toBe("128");
    expect((screen.getByLabelText("B") as HTMLInputElement).value).toBe("255");
  });

  it("re-encodes to hex when a channel changes", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#0080ff" format="rgb" />);
    const r = screen.getByLabelText("R");
    await user.clear(r);
    await user.type(r, "255");
    expect(currentValue()).toBe("#ff80ff");
  });

  it("shows blank channels when seeded with an unparseable colour", () => {
    render(<ColorHost initial="garbage" format="rgb" />);
    for (const ch of ["R", "G", "B"]) {
      expect((screen.getByLabelText(ch) as HTMLInputElement).value).toBe("");
    }
  });

  it("flags an out-of-range channel and withholds the emit", () => {
    render(<ColorHost initial="#0080ff" format="rgb" />);
    const r = screen.getByLabelText("R") as HTMLInputElement;
    // Single-shot change to an out-of-range value (typing would commit valid
    // prefixes like "3"/"30" first).
    fireEvent.change(r, { target: { value: "300" } });
    expect(r).toHaveAttribute("aria-invalid", "true");
    expect(currentValue()).toBe("#0080ff");
  });

  it("withholds the emit while a channel is blank", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#0080ff" format="rgb" />);
    const g = screen.getByLabelText("G") as HTMLInputElement;
    await user.clear(g);
    expect(g).toHaveAttribute("aria-invalid", "true");
    expect(currentValue()).toBe("#0080ff");
  });
});

describe("ColorField — hsl format", () => {
  it("decodes the colour into H/S/L channels", () => {
    render(<ColorHost initial="#ff0000" format="hsl" />);
    expect((screen.getByLabelText("H") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("S%") as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText("L%") as HTMLInputElement).value).toBe("50");
  });

  it("shows blank channels when seeded with an unparseable colour", () => {
    render(<ColorHost initial="garbage" format="hsl" />);
    for (const ch of ["H", "S%", "L%"]) {
      expect((screen.getByLabelText(ch) as HTMLInputElement).value).toBe("");
    }
  });

  it("re-encodes to hex when the hue changes", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="#ff0000" format="hsl" />);
    const h = screen.getByLabelText("H");
    await user.clear(h);
    await user.type(h, "120");
    expect(currentValue()).toBe("#00ff00");
  });
});

describe("ColorField — named format", () => {
  it("shows the current keyword and commits a valid one (lower-cased)", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="navy" format="named" />);
    const named = screen.getByLabelText("Named colour") as HTMLInputElement;
    expect(named.value).toBe("navy");
    await user.clear(named);
    await user.type(named, "Tomato");
    expect(currentValue()).toBe("tomato");
  });

  it("flags an unknown keyword and withholds the emit", async () => {
    const user = userEvent.setup();
    render(<ColorHost initial="navy" format="named" />);
    const named = screen.getByLabelText("Named colour") as HTMLInputElement;
    await user.clear(named);
    await user.type(named, "notacolour");
    expect(named).toHaveAttribute("aria-invalid", "true");
    expect(currentValue()).toBe("navy");
  });

  it("blanks out when seeded with a non-named colour", () => {
    render(<ColorHost initial="#123456" format="named" />);
    expect(
      (screen.getByLabelText("Named colour") as HTMLInputElement).value,
    ).toBe("");
  });
});

describe("ColorField — external value changes", () => {
  it("re-seeds the draft when the colour is replaced from outside", async () => {
    function Outer() {
      const [v, setV] = useState("#000000");
      return (
        <>
          <ColorField label="C" value={v} format="hex" onChange={setV} />
          <button type="button" onClick={() => setV("#ffffff")}>
            set white
          </button>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Outer />);
    const hex = screen.getByLabelText("Hex value") as HTMLInputElement;
    expect(hex.value).toBe("000000");
    await user.click(screen.getByRole("button", { name: "set white" }));
    expect(hex.value).toBe("ffffff");
  });
});

describe("TextAreaField", () => {
  it("renders the value and reports edits", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextAreaField label="Note" value="" onChange={onChange} />);
    await user.type(screen.getByLabelText("Note"), "x");
    expect(onChange).toHaveBeenLastCalledWith("x");
  });
});

describe("CountrySelect", () => {
  it("lists countries and emits the chosen ISO code", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CountrySelect label="Country" value="US" onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Country"), "FR");
    expect(onChange).toHaveBeenCalledWith("FR");
  });
});

describe("PhoneField", () => {
  it("shows the dial code for the current country and edits the number", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PhoneField
        label="Phone"
        value={{ country: "FR", dialCode: "+33", number: "" }}
        onChange={onChange}
      />,
    );
    const code = screen.getByLabelText(
      "Country dialling code",
    ) as HTMLSelectElement;
    expect(code.value).toBe("FR");
    await user.type(screen.getByLabelText("Phone"), "6");
    expect(onChange).toHaveBeenLastCalledWith({
      country: "FR",
      dialCode: "+33",
      number: "6",
    });
  });

  it("updates the dial code when another country is picked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PhoneField
        label="Phone"
        value={{ country: "FR", dialCode: "+33", number: "5" }}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText("Country dialling code"),
      "DE",
    );
    expect(onChange).toHaveBeenCalledWith({
      country: "DE",
      dialCode: "+49",
      number: "5",
    });
  });
});
