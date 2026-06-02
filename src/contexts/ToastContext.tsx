import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { CheckCircle, XCircle, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Clean up all timeouts on unmount
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutsRef.current.delete(id);
    }, 4000);
    timeoutsRef.current.set(id, timeout);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle className="w-4 h-4 text-[#a1a1aa]" />,
    error: <XCircle className="w-4 h-4 text-[#a1a1aa]" />,
    warning: <AlertTriangle className="w-4 h-4 text-[#a1a1aa]" />,
  };

  const bgColors: Record<ToastType, string> = {
    success: "bg-[#18181b] border-[#27272a]",
    error: "bg-[#18181b] border-[#27272a]",
    warning: "bg-[#18181b] border-[#27272a]",
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm shadow-lg animate-slide-up ${bgColors[t.type]}`}
          >
            {icons[t.type]}
            <span className="text-[#fafafa] flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="text-[#71717a] hover:text-[#fafafa] shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
