import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { detectTimezone, formatVersionInTimezone } from "@/hooks/useUserTimezone";

declare const APP_VERSION: string;

interface ChangelogEntry {
  date: string;
  title: string;
  content: string;
}

// Import all changelog markdown files from docs/
const changelogModules = import.meta.glob("/docs/*-changelog.md", { query: "?raw", import: "default" });

export function ChangelogView() {
  const navigate = useNavigate();
  const browserTz = useMemo(() => detectTimezone(), []);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    (async () => {
      const loaded: ChangelogEntry[] = [];
      for (const [path, loader] of Object.entries(changelogModules)) {
        const raw = (await loader()) as string;
        // Extract date from filename: /docs/2026-06-10-changelog.md
        const match = path.match(/(\d{4}-\d{2}-\d{2})-changelog/);
        if (!match) continue;
        const date = match[1];
        // Extract title from first line (# Title)
        const lines = raw.split("\n");
        const title = lines[0]?.replace(/^#\s*/, "").trim() || date;
        loaded.push({ date, title, content: raw });
      }
      loaded.sort((a, b) => b.date.localeCompare(a.date)); // newest first
      setEntries(loaded);
      // Auto-expand the 3 most recent
      setExpanded(new Set(loaded.slice(0, 3).map(e => e.date)));
      setLoading(false);
    })();
  }, []);

  const toggleExpand = (date: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
        // Scroll to the content after it renders
        setTimeout(() => {
          const el = contentRefs.current.get(date);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(entries.map(e => e.date)));
  const collapseAll = () => setExpanded(new Set());

  // Simple markdown → HTML (headings, bold, lists, code)
  const renderMarkdown = (md: string) => {
    const lines = md.split("\n");
    const html: string[] = [];
    let inList = false;
    let inCode = false;

    for (let i = 1; i < lines.length; i++) { // skip title line
      let line = lines[i];

      // Code blocks
      if (line.startsWith("```")) { inCode = !inCode; html.push(inCode ? '<pre class="bg-[#18181b] rounded-lg p-3 my-2 overflow-x-auto text-xs text-[#a1a1aa] font-mono">' : "</pre>"); continue; }
      if (inCode) { html.push(escapeHtml(line)); continue; }

      // Headings
      if (line.startsWith("## ")) {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push(`<h2 class="text-sm font-semibold text-[#fafafa] mt-4 mb-2">${escapeHtml(line.replace(/^##\s*/, ""))}</h2>`);
        continue;
      }
      if (line.startsWith("### ")) {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push(`<h3 class="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider mt-3 mb-1.5">${escapeHtml(line.replace(/^###\s*/, ""))}</h3>`);
        continue;
      }

      // List items
      if (line.match(/^[-*]\s/)) {
        if (!inList) { html.push('<ul class="space-y-0.5 my-1">'); inList = true; }
        html.push(`<li class="text-xs text-[#a1a1aa] ml-4 list-disc">${renderInline(line.replace(/^[-*]\s*/, ""))}</li>`);
        continue;
      }

      // Close list on blank line or non-list
      if (inList && (line.trim() === "" || !line.startsWith("-"))) { html.push("</ul>"); inList = false; }

      // Bold text lines
      if (line.trim()) {
        html.push(`<p class="text-xs text-[#a1a1aa] my-1">${renderInline(line)}</p>`);
      }
    }
    if (inList) html.push("</ul>");
    return html.join("");
  };

  const renderInline = (text: string) => {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[#d4d4d8] font-semibold">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-[#18181b] px-1 rounded text-[#a1a1aa] font-mono text-[11px]">$1</code>');
  };

  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center text-[#71717a]">Loading changelog…</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1 text-[#71717a] hover:text-[#fafafa] transition text-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to RaidScout
      </button>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#a1a1aa]" />
          <h1 className="text-lg font-bold text-[#fafafa]">Changelog</h1>
          <span className="text-xs text-[#71717a]">v{formatVersionInTimezone(APP_VERSION, browserTz)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={expandAll} className="text-xs text-[#a1a1aa] hover:text-[#fafafa] transition">Expand all</button>
          <button onClick={collapseAll} className="text-xs text-[#a1a1aa] hover:text-[#fafafa] transition">Collapse all</button>
        </div>
      </div>

      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.date} className="rounded-xl border border-[#27272a] bg-[#18181b] overflow-hidden">
            <button
              onClick={() => toggleExpand(entry.date)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[#09090b]/30 transition"
            >
              {expanded.has(entry.date) ? (
                <ChevronDown className="w-4 h-4 text-[#71717a] shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[#71717a] shrink-0" />
              )}
              <span className="text-sm font-medium text-[#fafafa]">{entry.title}</span>
              <span className="text-xs text-[#52525b] ml-auto">{entry.date}</span>
            </button>
            {expanded.has(entry.date) && (
              <div
                ref={(el) => { if (el) contentRefs.current.set(entry.date, el); }}
                className="px-4 pb-4 border-t border-[#27272a] pt-2"
              >
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
