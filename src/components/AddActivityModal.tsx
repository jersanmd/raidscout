import { useQueryClient } from "@tanstack/react-query";
import { useServer } from "@/contexts/ServerContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useServerTimezone } from "@/hooks/useServerTimezone";
import { AddActivityForm } from "@/components/AddActivityForm";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AddActivityModal({ open, onClose }: Props) {
  const { currentServer } = useServer();
  const queryClient = useQueryClient();
  const timezone = useServerTimezone();
  useEscapeKey(onClose, open);

  if (!open || !currentServer) return null;

  const handleCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["activities", currentServer.id] });
    queryClient.invalidateQueries({ queryKey: ["activity_instances", currentServer.id] });
    queryClient.invalidateQueries({ queryKey: ["activities-all", currentServer.id] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#18181b] border border-[#27272a] rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          <h2 className="text-base font-semibold text-[#fafafa]">Add Custom Activity</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <AddActivityForm
            gameId="custom"
            gameSlug="custom"
            serverId={currentServer.id}
            timezone={timezone}
            onCreated={handleCreated}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
