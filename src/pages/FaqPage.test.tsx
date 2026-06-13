import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../test/router";
import { FaqPage } from "./FaqPage";

describe("FaqPage", () => {
  it("renders the FAQ entries with their answers", () => {
    renderWithRouter(<FaqPage />);
    expect(screen.getByRole("heading", { name: "FAQ" })).toBeInTheDocument();
    // One question/answer pair per documented entry.
    expect(screen.getByText("How is my library kept?")).toBeInTheDocument();
    expect(screen.getByText("Is Dotcraft free?")).toBeInTheDocument();
    expect(screen.getByText("Do I need an account?")).toBeInTheDocument();
    expect(screen.getByText("Will my QR codes expire?")).toBeInTheDocument();
    expect(screen.getByText("Which formats can I export?")).toBeInTheDocument();
    expect(
      screen.getByText("What happens if I clear my browser data?"),
    ).toBeInTheDocument();
    // The privacy answer makes the local-only guarantee explicit.
    expect(
      screen.getByText(/nothing is uploaded to a server/),
    ).toBeInTheDocument();
  });
});
