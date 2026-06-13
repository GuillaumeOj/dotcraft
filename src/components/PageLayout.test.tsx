import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../test/router";
import { PageLayout } from "./PageLayout";

describe("PageLayout", () => {
  it("renders the title, subtitle, content and a back link to the editor", () => {
    renderWithRouter(
      <PageLayout title="Help Center" subtitle="Some guides">
        <p>Body content</p>
      </PageLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Help Center" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Some guides")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to editor" }),
    ).toHaveAttribute("href", "/");
  });

  it("changes the interface language from the picker", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PageLayout title="FAQ">content</PageLayout>);
    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    await user.selectOptions(select, "fr");
    expect(select.value).toBe("fr");
    expect(
      screen.getByRole("link", { name: "Retour à l’éditeur" }),
    ).toBeInTheDocument();
  });
});
