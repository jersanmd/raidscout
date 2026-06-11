// @ts-nocheck
import { describe, it, expect } from "vitest";
import { resolvePrefix } from "./notifications";

describe("resolvePrefix", () => {
  const roleMap = new Map([
    ["admin", "111"],
    ["mod", "222"],
    ["everyone", "333"],
    ["guild-leader", "444"],
  ]);

  it("resolves single @mention to role ID", () => {
    expect(resolvePrefix("@admin", roleMap)).toBe("<@&111>");
  });

  it("resolves multiple @mentions in one string", () => {
    expect(resolvePrefix("@admin @mod", roleMap)).toBe("<@&111> <@&222>");
  });

  it("leaves unmatched mentions as-is", () => {
    expect(resolvePrefix("@unknown something", roleMap)).toBe("@unknown something");
  });

  it("leaves non-mention text unchanged", () => {
    expect(resolvePrefix("Hello world", roleMap)).toBe("Hello world");
  });

  it("handles empty string", () => {
    expect(resolvePrefix("", roleMap)).toBe("");
  });

  it("handles empty role map", () => {
    expect(resolvePrefix("@admin test", new Map())).toBe("@admin test");
  });

  it("resolves mentions with underscores/dashes", () => {
    const map = new Map([["guild-leader", "444"]]);
    expect(resolvePrefix("@guild-leader", map)).toBe("<@&444>");
  });

  it("is case-insensitive via lowercase lookup", () => {
    // Name is lowercased before lookup
    expect(resolvePrefix("@Admin", roleMap)).toBe("<@&111>");
    expect(resolvePrefix("@MOD", roleMap)).toBe("<@&222>");
  });

  it("handles mixed matched + unmatched mentions", () => {
    expect(resolvePrefix("@admin @unknown @mod", roleMap)).toBe("<@&111> @unknown <@&222>");
  });

  it("handles prefix with no mentions at all", () => {
    expect(resolvePrefix("Spawn alert:", roleMap)).toBe("Spawn alert:");
  });

  it("does not match partial role names", () => {
    // @adm should NOT match "admin"
    expect(resolvePrefix("@adm", roleMap)).toBe("@adm");
  });
});
