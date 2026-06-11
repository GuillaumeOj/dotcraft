import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
] as const;

describe("Tabs", () => {
  it("marks the active tab selected", () => {
    render(<Tabs value="b" tabs={TABS} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("emits the clicked tab id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs value="a" tabs={TABS} onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
