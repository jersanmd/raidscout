import { supabase, supabaseUrl, supabaseKey, getCurrentServerId } from "./client";

// ── Realtime ────────────────────────────────────────────────

const activeChannels = new Map<string, ReturnType<typeof supabase.channel>>();

function getOrCreateChannel(chanName: string): { channel: ReturnType<typeof supabase.channel>; isNew: boolean } {
  const existing = activeChannels.get(chanName);
  if (existing) return { channel: existing, isNew: false };
  const channel = supabase.channel(chanName);
  activeChannels.set(chanName, channel);
  return { channel, isNew: true };
}

export function cleanupChannel(channel: ReturnType<typeof supabase.channel>) {
  for (const [name, ch] of activeChannels) {
    if (ch === channel) {
      activeChannels.delete(name);
      break;
    }
  }
  supabase.removeChannel(channel).catch(() => {});
}

export function subscribeToDeathRecords(
  serverId: string,
  onInsert: (record: any) => void,
  onUpdate: (record: any) => void,
  onDelete: (record: { id: string }) => void
) {
  const sid = serverId || "unknown";
  const chanName = `deaths-${sid}`;
  const { channel, isNew } = getOrCreateChannel(chanName);

  if (isNew) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "death_records" },
      (payload) => onInsert(payload.new as any));
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "death_records" },
      (payload) => onUpdate(payload.new as any));
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "death_records" },
      (payload) => onDelete(payload.old as { id: string }));
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  }

  return channel;
}

export function subscribeToBosses(serverId: string, onChange: () => void) {
  const sid = serverId || "unknown";
  const chanName = `bosses-${sid}`;
  const { channel, isNew } = getOrCreateChannel(chanName);

  if (isNew) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "bosses" }, () => onChange());
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "bosses" }, () => onChange());
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "bosses" }, () => onChange());
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  }

  return channel;
}

export function subscribeToActivityInstances(serverId: string, onChange: () => void) {
  const sid = serverId || "unknown";
  const chanName = `activity-instances-${sid}`;
  const { channel, isNew } = getOrCreateChannel(chanName);

  if (isNew) {
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_instances" }, () => onChange());
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "activity_instances" }, () => onChange());
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "activity_instances" }, () => onChange());
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  }

  return channel;
}

export function subscribeToServerSettings(
  serverId: string,
  onUpdate: (payload: any) => void
) {
  const chanName = `servers-${serverId}`;
  const { channel, isNew } = getOrCreateChannel(chanName);

  if (isNew) {
    const callbacks = new Set<(payload: any) => void>();
    (channel as any).__callbacks = callbacks;
    callbacks.add(onUpdate);
    channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "servers" },
      (payload) => callbacks.forEach(cb => cb(payload)));
    channel.subscribe((status) => {
      if (status === "CLOSED" || status === "CHANNEL_ERROR") activeChannels.delete(chanName);
    });
  } else {
    const callbacks = (channel as any).__callbacks as Set<(payload: any) => void>;
    if (callbacks) callbacks.add(onUpdate);
  }

  return channel;
}

export function subscribeToSpawnAlerts(
  serverId: string,
  onSpawn: (bossName: string) => void
) {
  return supabase
    .channel(`spawn-alerts-${serverId}`)
    .on("broadcast", { event: "boss_spawned" }, ({ payload }) => {
      onSpawn(payload.bossName);
    })
    .subscribe();
}
