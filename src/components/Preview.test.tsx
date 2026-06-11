import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as exportMod from "../qr/export";
import { Preview } from "./Preview";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("Preview", () => {
  it("renders the QR image from the svg data URI", () => {
    render(<Preview svg={SVG} px={250} error={null} />);
    const img = screen.getByAltText("QR code preview") as HTMLImageElement;
    expect(img.src).toContain("data:image/svg+xml");
    expect(screen.getByText(/250×250/)).toBeInTheDocument();
  });

  it("shows the error instead of the image when one is present", () => {
    render(<Preview svg="" px={0} error="Bad input" />);
    expect(screen.getByText("Bad input")).toBeInTheDocument();
    expect(screen.queryByAltText("QR code preview")).toBeNull();
    // No vector-size hint when px is 0.
    expect(screen.queryByText(/Vector size/)).toBeNull();
  });

  it("disables the download buttons when there is no svg", () => {
    render(<Preview svg="" px={0} error="err" />);
    expect(screen.getByRole("button", { name: /PNG/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /SVG/ })).toBeDisabled();
  });

  it("downloads an SVG when the SVG button is clicked", async () => {
    const spy = vi.spyOn(exportMod, "downloadSvg").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<Preview svg={SVG} px={100} error={null} />);
    await user.click(screen.getByRole("button", { name: /Download SVG/ }));
    expect(spy).toHaveBeenCalledWith(SVG);
  });

  it("downloads a PNG at the chosen size", async () => {
    const spy = vi.spyOn(exportMod, "downloadPng").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Preview svg={SVG} px={100} error={null} />);
    await user.selectOptions(screen.getByLabelText("PNG size"), "2048");
    await user.click(screen.getByRole("button", { name: /Download PNG/ }));
    expect(spy).toHaveBeenCalledWith(SVG, 2048);
  });

  it("defaults the PNG size to 1024", async () => {
    const spy = vi.spyOn(exportMod, "downloadPng").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Preview svg={SVG} px={100} error={null} />);
    await user.click(screen.getByRole("button", { name: /Download PNG/ }));
    expect(spy).toHaveBeenCalledWith(SVG, 1024);
  });
});
