import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import i18n from "../i18n/config";
import { errorMessages } from "./errors";

const t = i18n.t.bind(i18n);

describe("errorMessages", () => {
  it("translates each known field error once", () => {
    const err = new ApiError(400, "invalid", "x", {
      password: [
        { code: "password_too_short", message: "" },
        { code: "password_too_common", message: "" },
      ],
      new_password: [{ code: "password_too_short", message: "" }],
    });

    expect(errorMessages(err, t)).toEqual([
      "The password must be at least 8 characters long.",
      "This password is too common.",
    ]);
  });

  it("gives invalid e-mails their own message", () => {
    const err = new ApiError(400, "invalid", "x", {
      email: [{ code: "invalid", message: "" }],
    });

    expect(errorMessages(err, t)).toEqual(["Enter a valid e-mail address."]);
  });

  it("falls back to the overall code, then to a generic message", () => {
    expect(errorMessages(new ApiError(0, "network", "x"), t)).toEqual([
      "Can't reach the server. Check your connection and try again.",
    ]);
    expect(errorMessages(new ApiError(500, "http_500", "x"), t)).toEqual([
      "Something went wrong. Please try again.",
    ]);
    expect(errorMessages(new Error("boom"), t)).toEqual([
      "Something went wrong. Please try again.",
    ]);
  });

  it("uses the generic message for unknown field codes", () => {
    const err = new ApiError(400, "invalid", "x", {
      name: [{ code: "max_length", message: "" }],
    });

    expect(errorMessages(err, t)).toEqual([
      "Something went wrong. Please try again.",
    ]);
  });
});
