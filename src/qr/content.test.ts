import { describe, expect, it } from "vitest";
import {
  type ContentDrafts,
  emptyDrafts,
  encodeContent,
  legacyDataToContent,
  normalizeContent,
  type QrContent,
} from "./content";

const drafts = (): ContentDrafts => emptyDrafts("US");

describe("encodeContent", () => {
  it("returns text verbatim", () => {
    expect(encodeContent({ type: "text", text: "Hello world" })).toBe(
      "Hello world",
    );
  });

  it("prefixes a scheme-less URL with https://", () => {
    expect(encodeContent({ type: "url", url: "example.com" })).toBe(
      "https://example.com",
    );
    expect(encodeContent({ type: "url", url: "http://a.test" })).toBe(
      "http://a.test",
    );
    expect(encodeContent({ type: "url", url: "  " })).toBe("");
  });

  it("builds a mailto with encoded query parts, omitting empty ones", () => {
    expect(
      encodeContent({
        type: "email",
        to: "a@b.com",
        subject: "Hi there",
        body: "x&y",
      }),
    ).toBe("mailto:a@b.com?subject=Hi%20there&body=x%26y");
    expect(
      encodeContent({ type: "email", to: "a@b.com", subject: "", body: "" }),
    ).toBe("mailto:a@b.com");
    expect(
      encodeContent({ type: "email", to: "", subject: "", body: "" }),
    ).toBe("");
  });

  it("builds a tel: URI from dial code + digits, ignoring formatting", () => {
    expect(
      encodeContent({
        type: "phone",
        phone: { country: "US", dialCode: "+1", number: "555 123-4567" },
      }),
    ).toBe("tel:+15551234567");
    expect(
      encodeContent({
        type: "phone",
        phone: { country: "US", dialCode: "+1", number: "" },
      }),
    ).toBe("");
  });

  it("encodes wifi and escapes delimiters in ssid/password", () => {
    expect(
      encodeContent({
        type: "wifi",
        ssid: "My Net",
        password: "p;w",
        encryption: "WPA",
        hidden: true,
      }),
    ).toBe("WIFI:T:WPA;S:My Net;P:p\\;w;H:true;;");
  });

  it("omits the wifi password when the network is open", () => {
    expect(
      encodeContent({
        type: "wifi",
        ssid: "Open",
        password: "ignored",
        encryption: "nopass",
        hidden: false,
      }),
    ).toBe("WIFI:T:nopass;S:Open;;");
  });

  it("returns empty wifi when there is no ssid", () => {
    expect(
      encodeContent({
        type: "wifi",
        ssid: "",
        password: "",
        encryption: "WPA",
        hidden: false,
      }),
    ).toBe("");
  });

  it("builds a vCard, skipping empty fields and escaping commas/semicolons", () => {
    const svg = encodeContent({
      type: "vcard",
      firstName: "Ada",
      lastName: "Lovelace",
      org: "Analytical, Eng",
      title: "Mathematician",
      phone: { country: "GB", dialCode: "+44", number: "20 7946 0000" },
      email: "ada@x.test",
      url: "x.test",
      address: {
        street: "12 King St",
        city: "London",
        region: "",
        postalCode: "W1",
        countryCode: "GB",
      },
      note: "line1\nline2",
    });
    expect(svg).toContain("BEGIN:VCARD");
    expect(svg).toContain("VERSION:3.0");
    expect(svg).toContain("N:Lovelace;Ada");
    expect(svg).toContain("FN:Ada Lovelace");
    expect(svg).toContain("ORG:Analytical\\, Eng");
    expect(svg).toContain("TEL;TYPE=CELL:+442079460000");
    expect(svg).toContain("EMAIL:ada@x.test");
    expect(svg).toContain(
      "ADR;TYPE=HOME:;;12 King St;London;;W1;United Kingdom",
    );
    expect(svg).toContain("NOTE:line1\\nline2");
    expect(svg.endsWith("END:VCARD")).toBe(true);
  });

  it("produces a minimal vCard when only a name is set", () => {
    const out = encodeContent({
      ...drafts().vcard,
      firstName: "Bo",
    });
    expect(out).toBe("BEGIN:VCARD\nVERSION:3.0\nN:;Bo\nFN:Bo\nEND:VCARD");
  });
});

describe("emptyDrafts", () => {
  it("seeds phone and address country from the given country", () => {
    const d = emptyDrafts("FR");
    expect(d.phone.phone.dialCode).toBe("+33");
    expect(d.vcard.address.countryCode).toBe("FR");
  });

  it("falls back to the default country for an unknown code", () => {
    expect(emptyDrafts("ZZ").phone.phone.dialCode).toBe("+1");
  });

  it("provides one draft per content type", () => {
    const d = drafts();
    expect(Object.keys(d).sort()).toEqual(
      ["email", "phone", "text", "url", "vcard", "wifi"].sort(),
    );
  });
});

describe("legacyDataToContent", () => {
  it("treats URL-ish data as a url and the rest as text", () => {
    expect(legacyDataToContent("https://a.test")).toEqual({
      type: "url",
      url: "https://a.test",
    });
    expect(legacyDataToContent("shop.example.org")).toEqual({
      type: "url",
      url: "shop.example.org",
    });
    expect(legacyDataToContent("just some text")).toEqual({
      type: "text",
      text: "just some text",
    });
  });
});

describe("normalizeContent", () => {
  const fallback: QrContent = { type: "text", text: "fb" };

  it("coerces missing fields to empty strings per type", () => {
    expect(normalizeContent({ type: "email" }, fallback)).toEqual({
      type: "email",
      to: "",
      subject: "",
      body: "",
    });
  });

  it("preserves valid structured data", () => {
    const wifi = {
      type: "wifi",
      ssid: "N",
      password: "p",
      encryption: "WEP",
      hidden: true,
    };
    expect(normalizeContent(wifi, fallback)).toEqual(wifi);
  });

  it("snaps an unknown wifi encryption back to WPA", () => {
    const out = normalizeContent(
      { type: "wifi", ssid: "N", encryption: "bogus" },
      fallback,
    );
    expect(out).toMatchObject({
      type: "wifi",
      encryption: "WPA",
      hidden: false,
    });
  });

  it("keeps a stored phone dial code but defaults a missing one", () => {
    expect(
      normalizeContent(
        {
          type: "phone",
          phone: { country: "FR", dialCode: "+33", number: "1" },
        },
        fallback,
      ),
    ).toEqual({
      type: "phone",
      phone: { country: "FR", dialCode: "+33", number: "1" },
    });
    // A missing country/dial code falls back to the default country (US, +1).
    expect(normalizeContent({ type: "phone", phone: {} }, fallback)).toEqual({
      type: "phone",
      phone: { country: "US", dialCode: "+1", number: "" },
    });
  });

  it("normalizes a full vcard including its address", () => {
    const out = normalizeContent(
      {
        type: "vcard",
        firstName: "A",
        address: { city: "Paris", countryCode: "FR" },
      },
      fallback,
    );
    expect(out).toMatchObject({
      type: "vcard",
      firstName: "A",
      lastName: "",
      address: { city: "Paris", countryCode: "FR", street: "" },
    });
  });

  it("returns the fallback for an unrecognized type", () => {
    expect(normalizeContent({ type: "bogus" }, fallback)).toBe(fallback);
    expect(normalizeContent(null, fallback)).toBe(fallback);
  });
});
