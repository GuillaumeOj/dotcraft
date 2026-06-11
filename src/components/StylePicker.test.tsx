import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DOT_STYLES, EYE_STYLES } from "../qr/types";
import { dotSwatch, eyeSwatch, StylePicker } from "./StylePicker";

describe("StylePicker", () => {
  it("renders one radio per option with the active one checked", () => {
    render(
      <StylePicker
        label="Dot style"
        value="circle"
        options={DOT_STYLES}
        renderSwatch={dotSwatch}
        onChange={() => {}}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(DOT_STYLES.length);
    expect(screen.getByRole("radio", { name: /circle/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /square/i })).not.toBeChecked();
  });

  it("fires onChange with the clicked option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StylePicker
        label="Eye style"
        value="square"
        options={EYE_STYLES}
        renderSwatch={eyeSwatch}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /droplet/i }));
    expect(onChange).toHaveBeenCalledWith("droplet");
  });

  it("exposes the group via an accessible radiogroup name", () => {
    render(
      <StylePicker
        label="Dot style"
        value="circle"
        options={DOT_STYLES}
        renderSwatch={dotSwatch}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "Dot style" }),
    ).toBeInTheDocument();
  });
});

describe("swatch builders", () => {
  it("draws the dot primitive in the given colour", () => {
    expect(dotSwatch("circle", "#ff0000")).toContain("<circle");
    expect(dotSwatch("square", "#ff0000")).toContain('fill="#ff0000"');
  });

  it("draws an eye as an evenodd ring", () => {
    expect(eyeSwatch("droplet", "#fff")).toContain('fill-rule="evenodd"');
  });
});
