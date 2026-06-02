import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  message?: string;
  onRetry: () => void;
  details?: string;
}

export function ErrorRetry({ message = "Something went wrong", onRetry, details }: Props) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 mx-auto rounded-xl bg-red-900/30 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Error</h3>
          <p className="text-slate-400 text-sm mt-1">{message}</p>
        </div>
        {details && (
          <details className="text-left">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
              Technical details
            </summary>
            <pre className="mt-1 text-xs text-slate-500 bg-slate-800 rounded p-2 overflow-auto max-h-32">
              {details}
            </pre>
          </details>
        )}
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 mx-auto px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition border border-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try Again
        </button>
      </div>
    </div>
  );
}
