// @ts-nocheck
import { describe, it, expect } from "vitest";
import { formatPartyListForThread, type PartyListEntry } from "./party-utils";

describe("formatPartyListForThread", () => {
  it("returns null for empty array", () => {
    expect(formatPartyListForThread([])).toBeNull();
  });

  it("formats a single party with members", () => {
    const parties: PartyListEntry[] = [
      { name: "Party A", guildName: "Alpha", members: ["John 🛡Alpha", "Jane 🛡Alpha"] },
    ];
    const result = formatPartyListForThread(parties);
    expect(result).toContain("**Party A** [Alpha] (2)");
    expect(result).toContain("John 🛡Alpha, Jane 🛡Alpha");
    expect(result).toContain("─".repeat(20));
  });

  it('formats a party without guild name (no "[Guild]" suffix)', () => {
    const parties: PartyListEntry[] = [
      { name: "Solo Party", guildName: null, members: ["Alice"] },
    ];
    const result = formatPartyListForThread(parties);
    expect(result).toContain("**Solo Party** (1)");
    expect(result).not.toContain("[null]");
    expect(result).not.toContain("[");
  });

  it('shows "_No members_" for empty member lists', () => {
    const parties: PartyListEntry[] = [
      { name: "Empty Party", guildName: "Bravo", members: [] },
    ];
    const result = formatPartyListForThread(parties);
    expect(result).toContain("_No members_");
  });

  it("formats multiple parties with blank lines between", () => {
    const parties: PartyListEntry[] = [
      { name: "Party 1", guildName: "Alpha", members: ["A"] },
      { name: "Party 2", guildName: "Bravo", members: ["B"] },
    ];
    const result = formatPartyListForThread(parties);
    expect(result).toContain("**Party 1** [Alpha] (1)");
    expect(result).toContain("**Party 2** [Bravo] (1)");
  });

  it("returns a string ending with separator line", () => {
    const parties: PartyListEntry[] = [
      { name: "P", guildName: null, members: ["X"] },
    ];
    const result = formatPartyListForThread(parties);
    expect(result!.endsWith("─".repeat(20))).toBe(true);
  });

  it("handles members with guild badges in their names", () => {
    const parties: PartyListEntry[] = [
      {
        name: "Mixed Party",
        guildName: "Charlie",
        members: ["Player1 🛡Alpha", "Player2 🛡Bravo", "Player3"],
      },
    ];
    const result = formatPartyListForThread(parties);
    expect(result).toContain("Player1 🛡Alpha");
    expect(result).toContain("Player3");
  });
});
