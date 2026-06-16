import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

interface ExpiredGateProps {
  page: string;
}

/** Shown when a server's access has expired. Blocks the page content. */
export function ExpiredGate({ page }: ExpiredGateProps) {
  return (
    <div className="max-w-[99%] 2xl:max-w-[1600px] mx-auto px-3 sm:px-4 py-4 sm:py-6">
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#18181b] border border-[#27272a] flex items-center justify-center">
          <Lock className="w-8 h-8 text-[#52525b]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[#fafafa]">{page} is locked</h2>
          <p className="text-sm text-[#71717a] mt-1 max-w-md">
            Your access has expired. Extend your server to unlock {page.toLowerCase()} and all other features.
          </p>
        </div>
        <Link
          to="/billing"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#fafafa] text-[#09090b] text-sm font-medium hover:bg-white transition"
        >
          Extend Access — $9.99
        </Link>
      </div>
    </div>
  );
}
