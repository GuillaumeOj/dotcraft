import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BLOG_URL, GITHUB_URL } from "../links";
import { renderWithRouter } from "../test/router";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("links to the FAQ and Help Center routes", () => {
    renderWithRouter(<Footer />);
    expect(screen.getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/faq",
    );
    expect(screen.getByRole("link", { name: "Help Center" })).toHaveAttribute(
      "href",
      "/help-center",
    );
  });

  it("links out to the blog and GitHub in new tabs", () => {
    renderWithRouter(<Footer />);
    const blog = screen.getByRole("link", { name: "Blog" });
    expect(blog).toHaveAttribute("href", BLOG_URL);
    expect(blog).toHaveAttribute("target", "_blank");
    expect(blog).toHaveAttribute("rel", "noreferrer");

    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("href", GITHUB_URL);
  });

  it("shows the Lyon credit", () => {
    renderWithRouter(<Footer />);
    expect(screen.getByText(/Made with/)).toHaveTextContent("in Lyon");
  });
});
