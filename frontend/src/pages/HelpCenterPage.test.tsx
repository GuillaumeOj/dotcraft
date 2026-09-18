import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUG_REPORT_URL, FEATURE_REQUEST_URL } from "../links";
import { renderWithRouter } from "../test/router";
import { HelpCenterPage } from "./HelpCenterPage";

describe("HelpCenterPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the articles with stable anchors and the error-correction table", () => {
    const { container } = renderWithRouter(<HelpCenterPage />);
    expect(
      screen.getByRole("heading", { name: "Help Center" }),
    ).toBeInTheDocument();
    // Anchors match the InfoLink targets on the editor controls.
    for (const id of [
      "library",
      "export-qr",
      "error-correction",
      "request-feature",
      "report-bug",
    ]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    // The error-correction article reuses the editor's level descriptions.
    expect(screen.getByText("Quartile")).toBeInTheDocument();
    expect(screen.getByText(/Recovers from ~25% damage/)).toBeInTheDocument();
    // The library article warns about importing untrusted .dotcraft files.
    expect(
      screen.getByText(/Only import .dotcraft files from a source you trust/),
    ).toBeInTheDocument();
  });

  it("links the feature and bug articles to the GitHub issue forms", () => {
    renderWithRouter(<HelpCenterPage />);
    expect(
      screen.getByRole("link", { name: "Open a feature request" }),
    ).toHaveAttribute("href", FEATURE_REQUEST_URL);
    expect(
      screen.getByRole("link", { name: "Open a bug report" }),
    ).toHaveAttribute("href", BUG_REPORT_URL);
  });

  it("scrolls to the anchored article from the URL hash", () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    renderWithRouter(<HelpCenterPage />, {
      route: "/help-center#error-correction",
    });
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
