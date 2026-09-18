import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Navbar } from "./Navbar";

function renderNavbar(over: Partial<Parameters<typeof Navbar>[0]> = {}) {
  const props = {
    language: "en",
    onChangeLanguage: vi.fn(),
    onOpenLibrary: vi.fn(),
    onOpenSettings: vi.fn(),
    ...over,
  };
  render(<Navbar {...props} />);
  return props;
}

describe("Navbar", () => {
  it("toggles the stacked menu open and closed", async () => {
    const user = userEvent.setup();
    renderNavbar();
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
  });

  it("reveals the language picker and the modal links in the menu", async () => {
    const user = userEvent.setup();
    renderNavbar();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("changes the language and closes the menu", async () => {
    const user = userEvent.setup();
    const { onChangeLanguage } = renderNavbar();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.selectOptions(screen.getByLabelText("Language"), "fr");
    expect(onChangeLanguage).toHaveBeenCalledWith("fr");
    // The menu collapses once a language is chosen.
    expect(screen.queryByLabelText("Language")).toBeNull();
  });

  it("opens the library and closes the menu on selection", async () => {
    const user = userEvent.setup();
    const { onOpenLibrary } = renderNavbar();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(onOpenLibrary).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
  });

  it("opens the settings modal from the menu", async () => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderNavbar();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("closes the menu on Escape", async () => {
    const user = userEvent.setup();
    renderNavbar();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
  });

  it("closes the menu on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Navbar
          language="en"
          onChangeLanguage={() => {}}
          onOpenLibrary={() => {}}
          onOpenSettings={() => {}}
        />
        <button type="button">outside</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
  });
});
