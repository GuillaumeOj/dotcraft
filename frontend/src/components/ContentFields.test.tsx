import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyDrafts } from "../qr/content";
import { ContentFields } from "./ContentFields";

const drafts = emptyDrafts("US");

describe("ContentFields", () => {
  it("edits text content", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.text} onChange={onChange} />);
    await user.type(screen.getByLabelText("Text"), "h");
    expect(onChange).toHaveBeenLastCalledWith({ type: "text", text: "h" });
  });

  it("edits url content", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.url} onChange={onChange} />);
    await user.type(screen.getByLabelText("URL"), "a");
    expect(onChange).toHaveBeenLastCalledWith({ type: "url", url: "a" });
  });

  it("edits each email field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.email} onChange={onChange} />);
    await user.type(screen.getByLabelText("To"), "x");
    expect(onChange).toHaveBeenLastCalledWith({
      type: "email",
      to: "x",
      subject: "",
      body: "",
    });
    await user.type(screen.getByLabelText("Message"), "y");
    expect(onChange).toHaveBeenLastCalledWith({
      type: "email",
      to: "",
      subject: "",
      body: "y",
    });
  });

  it("defaults the phone dial code to the seeded country", () => {
    render(<ContentFields content={drafts.phone} onChange={() => {}} />);
    const code = screen.getByLabelText(
      "Country dialling code",
    ) as HTMLSelectElement;
    expect(code.value).toBe("US");
  });

  it("hides the wifi password for an open network and toggles hidden", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const open = { ...drafts.wifi, encryption: "nopass" as const };
    const { rerender } = render(
      <ContentFields content={open} onChange={onChange} />,
    );
    expect(screen.queryByLabelText("Password")).toBeNull();

    rerender(<ContentFields content={drafts.wifi} onChange={onChange} />);
    expect(screen.getByLabelText("Password")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Hidden network"));
    expect(onChange).toHaveBeenLastCalledWith({ ...drafts.wifi, hidden: true });
  });

  it("changes the wifi security level", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.wifi} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("Security"), "WEP");
    expect(onChange).toHaveBeenLastCalledWith({
      ...drafts.wifi,
      encryption: "WEP",
    });
  });

  it("edits a vcard name and address country", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.vcard} onChange={onChange} />);
    await user.type(screen.getByLabelText("First name"), "A");
    expect(onChange).toHaveBeenLastCalledWith({
      ...drafts.vcard,
      firstName: "A",
    });
    await user.selectOptions(screen.getByLabelText("Country"), "FR");
    expect(onChange).toHaveBeenLastCalledWith({
      ...drafts.vcard,
      address: { ...drafts.vcard.address, countryCode: "FR" },
    });
  });

  it.each([
    ["Last name", "lastName"],
    ["Organisation", "org"],
    ["Job title", "title"],
    ["Email", "email"],
    ["Website", "url"],
    ["Note", "note"],
  ] as const)("edits the vcard %s field", async (label, key) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.vcard} onChange={onChange} />);
    await user.type(screen.getByLabelText(label), "z");
    expect(onChange).toHaveBeenLastCalledWith({ ...drafts.vcard, [key]: "z" });
  });

  it.each([
    ["Street", "street"],
    ["City", "city"],
    ["Region / State", "region"],
    ["Postal code", "postalCode"],
  ] as const)("edits the vcard address %s field", async (label, key) => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.vcard} onChange={onChange} />);
    await user.type(screen.getByLabelText(label), "z");
    expect(onChange).toHaveBeenLastCalledWith({
      ...drafts.vcard,
      address: { ...drafts.vcard.address, [key]: "z" },
    });
  });

  it("edits the vcard phone via its country picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContentFields content={drafts.vcard} onChange={onChange} />);
    await user.selectOptions(
      screen.getByLabelText("Country dialling code"),
      "DE",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      ...drafts.vcard,
      phone: { ...drafts.vcard.phone, country: "DE", dialCode: "+49" },
    });
  });
});
