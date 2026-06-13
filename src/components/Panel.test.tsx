import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Panel } from "./Panel";

describe("Panel", () => {
  it("renders a plain, always-open panel when not collapsible", () => {
    render(
      <Panel title="Style">
        <p>fields</p>
      </Panel>,
    );
    // No disclosure toggle on desktop.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("fields")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Style" })).toBeInTheDocument();
  });

  it("exposes an expanded disclosure toggle that fires onToggle", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <Panel title="Style" collapsible collapsed={false} onToggle={onToggle}>
        <p>fields</p>
      </Panel>,
    );
    const toggle = screen.getByRole("button", { name: "Style" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("keeps the title visible and marks the surface collapsed when folded", () => {
    render(
      <Panel title="Style" collapsible collapsed onToggle={() => {}}>
        <p>fields</p>
      </Panel>,
    );
    const toggle = screen.getByRole("button", { name: "Style" });
    // The title stays visible while folded; only the body hides.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.closest(".panel")).toHaveClass("is-collapsed");
  });
});
