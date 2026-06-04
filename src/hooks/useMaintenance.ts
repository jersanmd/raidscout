import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useMaintenance() {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("app_settings").select("value")
      .eq("key", "maintenance_mode")
      .then(
        ({ data, error }) => {
          if (!error && data?.length > 0) {
            setIsMaintenance((data[0] as any)?.value === "true");
          }
          setLoading(false);
        },
        () => setLoading(false)
      );
  }, []);

  return { isMaintenance, loading };
}