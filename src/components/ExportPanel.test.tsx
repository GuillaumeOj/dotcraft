import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as exportMod from "../qr/export";
import { ExportPanel } from "./ExportPanel";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("ExportPanel", () => {
  it("shows the vector size, omitting it when px is 0", () => {
    const { rerender } = render(<ExportPanel svg={SVG} px={250} />);
    expect(screen.getByText(/250×250/)).toBeInTheDocument();
    rerender(<ExportPanel svg="" px={0} />);
    expect(screen.queryByText(/Vector size/)).toBeNull();
  });

  it("disables the download buttons when there is no svg", () => {
    render(<ExportPanel svg="" px={0} />);
    expect(screen.getByRole("button", { name: /PNG/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /SVG/ })).toBeDisabled();
  });

  it("downloads an SVG when the SVG button is clicked", async () => {
    const spy = vi.spyOn(exportMod, "downloadSvg").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<ExportPanel svg={SVG} px={100} />);
    await user.click(screen.getByRole("button", { name: /Download SVG/ }));
    expect(spy).toHaveBeenCalledWith(SVG);
  });

  it("downloads a PNG at the chosen size", async () => {
    const spy = vi.spyOn(exportMod, "downloadPng").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ExportPanel svg={SVG} px={100} />);
    await user.selectOptions(screen.getByLabelText("PNG size"), "2048");
    await user.click(screen.getByRole("button", { name: /Download PNG/ }));
    expect(spy).toHaveBeenCalledWith(SVG, 2048);
  });

  it("defaults the PNG size to 1024", async () => {
    const spy = vi.spyOn(exportMod, "downloadPng").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ExportPanel svg={SVG} px={100} />);
    await user.click(screen.getByRole("button", { name: /Download PNG/ }));
    expect(spy).toHaveBeenCalledWith(SVG, 1024);
  });
});
