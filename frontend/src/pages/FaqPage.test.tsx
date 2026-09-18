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
    // The account and sync entries document the optional cloud copy.
    expect(
      screen.getByText(
        "What happens if I edit the same QR code on two devices?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("I forgot my password. What can I do?"),
    ).toBeInTheDocument();
    // The privacy answer makes the no-account guarantee explicit.
    expect(
      screen.getByText(/Without an account, nothing is uploaded/),
    ).toBeInTheDocument();
  });
});
