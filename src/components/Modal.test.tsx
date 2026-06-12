import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, Modal } from "./Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} title="Hi" onClose={vi.fn()}>
        body
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog when open", () => {
    render(
      <Modal open title="Replace logo?" onClose={vi.fn()}>
        body
      </Modal>,
    );
    expect(
      screen.getByRole("dialog", { name: "Replace logo?" }),
    ).toBeInTheDocument();
  });

  it("closes on Escape, on the close button and on a backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open title="Hi" onClose={onClose}>
        body
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    // Clicking the dialog panel itself must NOT close it.
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    // Clicking the backdrop closes it.
    fireEvent.click(document.querySelector(".modal__backdrop") as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("ConfirmDialog", () => {
  it("reports confirm and cancel", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Replace?"
        message="Sure?"
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("Sure?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
