import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CollapsiblePanel } from "./CollapsiblePanel";

describe("CollapsiblePanel", () => {
  it("renders a plain, always-open panel when not collapsible", () => {
    render(
      <CollapsiblePanel title="Style">
        <p>fields</p>
      </CollapsiblePanel>,
    );
    // No disclosure toggle on desktop.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("fields")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Style" })).toBeInTheDocument();
  });

  it("exposes an expanded disclosure toggle that fires onToggle", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <CollapsiblePanel
        title="Style"
        collapsible
        collapsed={false}
        onToggle={onToggle}
      >
        <p>fields</p>
      </CollapsiblePanel>,
    );
    const toggle = screen.getByRole("button", { name: "Style" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("marks the fieldset collapsed and the toggle closed when folded", () => {
    render(
      <CollapsiblePanel title="Style" collapsible collapsed onToggle={() => {}}>
        <p>fields</p>
      </CollapsiblePanel>,
    );
    expect(screen.getByRole("button", { name: "Style" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("group", { name: "Style" })).toHaveClass(
      "is-collapsed",
    );
  });
});
