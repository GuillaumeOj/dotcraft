import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../test/router";
import { InfoLink } from "./InfoLink";

describe("InfoLink", () => {
  it("links to the matching Help Center article with an accessible name", () => {
    renderWithRouter(<InfoLink anchor="library" label="Library help" />);
    const link = screen.getByRole("link", { name: "Library help" });
    expect(link).toHaveAttribute("href", "/help-center#library");
  });
});
