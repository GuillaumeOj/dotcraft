import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { renderWithRouter } from "./test/router";

describe("App routing", () => {
  it("renders the FAQ page at /faq", () => {
    renderWithRouter(<App />, { route: "/faq" });
    expect(screen.getByRole("heading", { name: "FAQ" })).toBeInTheDocument();
  });

  it("renders the Help Center page at /help-center", () => {
    renderWithRouter(<App />, { route: "/help-center" });
    expect(
      screen.getByRole("heading", { name: "Help Center" }),
    ).toBeInTheDocument();
  });
});
