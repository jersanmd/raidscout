import { useState } from "react";
import { Skull } from "lucide-react";

interface BossImageProps {
  bossName: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
};

/**
 * Shows the boss image from /bosses/{name}.png if it exists,
 * otherwise shows a styled fallback placeholder with initials.
 *
 * Image naming: lowercase, no spaces, no underscores.
 * Example: public/bosses/ladydalia.png, public/bosses/venatus.png
 *
 * Special cases mapped here for files that don't exactly match the boss name.
 */
const FILE_OVERRIDES: Record<string, string> = {
  Baron: "baronbraudmore",
};

function bossToFilename(bossName: string): string {
  // Strip " · Day" suffix for split bosses (e.g., "Neutro · Tue" → "Neutro")
  const baseName = bossName.replace(/\s*·\s*\w{3}$/, "");
  if (FILE_OVERRIDES[baseName]) {
    return FILE_OVERRIDES[baseName];
  }
  if (FILE_OVERRIDES[bossName]) {
    return FILE_OVERRIDES[bossName];
  }
  return baseName.toLowerCase().replace(/\s+/g, "");
}

export function BossImage({ bossName, imageUrl, size = "md", className = "" }: BossImageProps) {
  const [imgError, setImgError] = useState(false);
  const src = imageUrl || `/bosses/${bossToFilename(bossName)}.png`;

  if (!imgError) {
    return (
      <img
        src={src}
        alt={bossName}
        loading="lazy"
        className={`${sizeMap[size]} rounded-xl object-cover shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: colored placeholder with initials
  const initials = bossName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hue = bossName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className={`${sizeMap[size]} rounded-xl shrink-0 flex items-center justify-center font-bold ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 60%, 25%), hsl(${hue}, 50%, 15%))`,
        border: `1px solid hsl(${hue}, 40%, 35%)`,
        color: `hsl(${hue}, 70%, 75%)`,
      }}
    >
      {initials}
    </div>
  );
}
