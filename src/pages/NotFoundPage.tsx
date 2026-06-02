import { Link } from "react-router-dom";
import { Skull } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-900/20 flex items-center justify-center">
          <Skull className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold text-white mb-2">404</h1>
          <p className="text-slate-400">This boss doesn't spawn here.</p>
          <p className="text-slate-600 text-sm mt-1">The page you're looking for doesn't exist or has been moved.</p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 transition shadow-lg shadow-red-900/20"
        >
          Back to Bosses
        </Link>
      </div>
    </div>
  );
}
