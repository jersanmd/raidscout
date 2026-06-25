import { useMemo, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useDeathRecords } from "@/hooks/useDeathRecords";
import { useMembers } from "@/hooks/useMembers";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface OnboardingItem {
  id: string;
  label: string;
  description: string;
  done: boolean;
  cta: { label: string; href?: string; copyText?: string };
}

const DKP_EXPLORED_KEY = "raidscout-onboarding-dkp-seen";
const DISMISSED_KEY = "raidscout-onboarding-dismissed";

// ── Shared module-level state so dismiss in one component re-renders ALL consumers ──
const _dismissedServers = new Set<string>();
let _dismissVersion = 0;
const _onDismissCallbacks = new Set<() => void>();

// Seed from localStorage at module init
if (typeof window !== "undefined") {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DISMISSED_KEY + "-")) {
      _dismissedServers.add(key.slice(DISMISSED_KEY.length + 1));
    }
  }
}

export function useOnboardingProgress() {
  const { currentServer } = useServer();
  const { data: deathRecords } = useDeathRecords();
  const { data: members } = useMembers();

  const serverId = currentServer?.id ?? "";
  const serverRole = currentServer?.role;

  // Shared dismissed state — when any component dismisses, ALL consumers re-render
  const [, setDismissTick] = useState(_dismissVersion);
  useEffect(() => {
    const cb = () => setDismissTick(_dismissVersion);
    _onDismissCallbacks.add(cb);
    return () => { _onDismissCallbacks.delete(cb); };
  }, []);
  const dismissed = _dismissedServers.has(serverId);

  const isStaff = serverRole === "owner" || serverRole === "moderator";

  // Bot is linked when at least one discord_configs row exists (bot added + channel configured)
  const { data: discordConfigs } = useQuery({
    queryKey: ["discord_configs", serverId],
    queryFn: async () => {
      if (!isSupabaseConfigured() || !serverId) return [];
      const { data } = await supabase.from("discord_configs").select("id").eq("raidscout_server_id", serverId);
      return data ?? [];
    },
    staleTime: 60_000,
    enabled: !!serverId,
  });
  const discordLinked = (discordConfigs?.length ?? 0) > 0;
  const hasMembers = (members?.length ?? 0) > 0;
  const hasKills = (deathRecords?.length ?? 0) > 0;

  // React state so changes trigger re-render in all consumers
  const [dkpExplored, setDkpExplored] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`${DKP_EXPLORED_KEY}-${serverId}`) === "true";
  });

  const markDkpExplored = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${DKP_EXPLORED_KEY}-${serverId}`, "true");
    }
    setDkpExplored(true);
  }, [serverId]);

  const items: OnboardingItem[] = useMemo(() => [
    {
      id: "members",
      label: "Add raid members",
      description: "Invite your raid team to track attendance and kills.",
      done: hasMembers,
      cta: { label: "Add Members", href: "/members" },
    },
    {
      id: "discord",
      label: "Link Discord bot",
      description: "Get spawn notifications and auto-threads in your server.",
      done: discordLinked,
      cta: { label: "Setup Discord", href: "/server-settings?tab=integrations" },
    },
    {
      id: "firstkill",
      label: "Record first boss kill",
      description: "Use !killed BossName in Discord to start tracking spawns.",
      done: hasKills,
      cta: { label: "Copy Command", copyText: `!killed BossName` },
    },
    {
      id: "dkp",
      label: "Explore DKP loot system",
      description: "Run fair auctions with bidding, auto-resolve, and transaction history.",
      done: dkpExplored,
      cta: { label: "Open DKP", href: "/dkp" },
    },
  ], [hasMembers, discordLinked, hasKills, dkpExplored]);

  const completed = items.filter(i => i.done).length;
  const total = items.length;
  const allDone = completed === total;

  // Only show for staff on fresh servers (no kills yet) that haven't been dismissed
  const show = isStaff && !hasKills && !dismissed && serverId !== "";

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`${DISMISSED_KEY}-${serverId}`, "true");
    }
    _dismissedServers.add(serverId);
    _dismissVersion++;
    _onDismissCallbacks.forEach(cb => cb());
  }, [serverId]);

  return { items, completed, total, allDone, show, dismiss, markDkpExplored };
}
