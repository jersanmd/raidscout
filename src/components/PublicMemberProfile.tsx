import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/lib/api/client";
import { Loader2 } from "lucide-react";

/**
 * Public member profile resolver — accessible without login via /m/:slug
 * Resolves the slug to a memberId, then redirects to the full profile.
 */
export function PublicMemberProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("members")
      .select("id")
      .eq("public_slug", slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setError(true);
        } else {
          setMemberId(data.id);
        }
        setLoading(false);
      });
  }, [slug]);

  if (loading) return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#52525b] animate-spin" />
    </div>
  );
  
  if (error || !memberId) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-[#fafafa] text-lg font-semibold">Profile not found</p>
          <p className="text-[#52525b] text-sm">This member profile link is invalid or has been removed.</p>
        </div>
      </div>
    );
  }

  return <Navigate to={`/members/${memberId}`} replace />;
}
