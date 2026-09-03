import { describe, it, expect } from "vitest";
import { mergePartyLeaders } from "./attendance";

// Both copy-attendance flows carry the source's per-guild party leaders
// ({guild_id: member_id}) onto the target: boss kills read/write
// death_records.party_leaders, activities read/write
// activity_instances.party_leaders. They share this one policy function, so
// these cases cover both paths: fill only guilds the target has no leader for
// — never overwrite.

describe("mergePartyLeaders", () => {
  it("copies the source's leaders when the target has none", () => {
    expect(mergePartyLeaders({ g1: "alice", g2: "bob" }, {}))
      .toEqual({ g1: "alice", g2: "bob" });
  });

  it("never overwrites a leader already set on the target", () => {
    expect(mergePartyLeaders({ g1: "alice" }, { g1: "carol" })).toEqual({});
  });

  it("fills only the missing guilds", () => {
    expect(mergePartyLeaders({ g1: "alice", g2: "bob" }, { g1: "carol" }))
      .toEqual({ g2: "bob" });
  });

  it("handles null/undefined maps (older rows default to {})", () => {
    expect(mergePartyLeaders(null, undefined)).toEqual({});
    expect(mergePartyLeaders(undefined, { g1: "carol" })).toEqual({});
    expect(mergePartyLeaders({ g1: "alice" }, null)).toEqual({ g1: "alice" });
  });

  it("skips empty-string leader values on the source", () => {
    expect(mergePartyLeaders({ g1: "" }, {})).toEqual({});
  });

  it("treats the DeathRecordModal's no-guild sentinel key like any other guild", () => {
    // Leaders for members without a guild are stored under "_none_".
    expect(mergePartyLeaders({ _none_: "alice" }, {})).toEqual({ _none_: "alice" });
  });
});
