interface FullScreenLoaderProps {
  /** Optional message shown below the spinner */
  message?: string;
}

/**
 * Full-screen dark overlay that hides everything while the app initializes.
 * No CSS transition — removed instantly when the parent unmounts it,
 * ensuring zero flash of content underneath.
 */
export function FullScreenLoader({ message }: FullScreenLoaderProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#09090b]">
      {/* Spinner */}
      <div className="relative">
        {/* Outer ring */}
        <div className="w-12 h-12 rounded-full border-2 border-[#1e1e2a]" />
        {/* Spinning arc */}
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-red-500 animate-spin" />
      </div>

      {/* Message */}
      {message && (
        <p className="mt-4 text-sm text-[#52525b] animate-pulse">{message}</p>
      )}
    </div>
  );
}
