import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Preview } from "./Preview";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("Preview", () => {
  it("renders its title as a panel heading", () => {
    render(<Preview svg={SVG} error={null} />);
    expect(
      screen.getByRole("heading", { name: "Preview" }),
    ).toBeInTheDocument();
  });

  it("renders the QR image from the svg data URI", () => {
    render(<Preview svg={SVG} error={null} />);
    const img = screen.getByAltText("QR code preview") as HTMLImageElement;
    expect(img.src).toContain("data:image/svg+xml");
  });

  it("shows the error instead of the image when one is present", () => {
    render(<Preview svg="" error="Bad input" />);
    expect(screen.getByText("Bad input")).toBeInTheDocument();
    expect(screen.queryByAltText("QR code preview")).toBeNull();
  });
});
