import { useState, useEffect } from "react";
import { ws } from "../ws";
import { Loader2, RefreshCw, Monitor, ChevronRight, Globe, Code, Folder, FileText, Terminal, Music, MessageCircle, Users, Briefcase, Video } from "lucide-react";

interface WindowInfo {
  id: number;
  title: string;
}

export default function AppSwitcherPanel() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchWindows = () => {
    setLoading(true);
    ws.send({ type: "get_windows" });
  };

  useEffect(() => {
    const unsubscribe = ws.addMessageHandler((msg: any) => {
      if (msg.type === "windows_list") {
        setWindows(msg.windows || []);
        setLoading(false);
      }
    });

    // Fetch on mount
    if (ws.connected) fetchWindows();

    return () => { unsubscribe(); };
  }, []);

  const focusWindow = (id: number) => {
    ws.send({ type: "focus_window", id });
  };

  const filtered = windows.filter((w) =>
    w.title.toLowerCase().includes(filter.toLowerCase())
  );

  const getIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("chrome") || t.includes("chromium")) return <Globe size={20} />;
    if (t.includes("firefox")) return <Globe size={20} />;
    if (t.includes("edge")) return <Globe size={20} />;
    if (t.includes("code") || t.includes("vscode")) return <Code size={20} />;
    if (t.includes("explorer")) return <Folder size={20} />;
    if (t.includes("notepad")) return <FileText size={20} />;
    if (t.includes("terminal") || t.includes("powershell") || t.includes("cmd")) return <Terminal size={20} />;
    if (t.includes("spotify")) return <Music size={20} />;
    if (t.includes("discord")) return <MessageCircle size={20} />;
    if (t.includes("word")) return <FileText size={20} />;
    if (t.includes("excel")) return <FileText size={20} />;
    if (t.includes("powerpoint")) return <Video size={20} />;
    if (t.includes("teams")) return <Users size={20} />;
    if (t.includes("slack")) return <Briefcase size={20} />;
    if (t.includes("zoom")) return <Video size={20} />;
    return <Monitor size={20} />;
  };

  return (
    <div className="app-switcher-panel">
      <div className="app-switcher-header">
        <input
          id="app-filter-input"
          className="app-filter"
          type="text"
          placeholder="Filter apps..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          id="btn-refresh-windows"
          className="refresh-btn"
          onClick={fetchWindows}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon"><Monitor size={48} strokeWidth={1.5} /></div>
          <p>{windows.length === 0 ? "Press refresh to load open windows" : "No windows match your search"}</p>
        </div>
      )}

      <div className="app-list">
        {filtered.map((w) => (
          <button
            key={w.id}
            id={`app-${w.id}`}
            className="app-item"
            onClick={() => focusWindow(w.id)}
          >
            <span className="app-item-icon">{getIcon(w.title)}</span>
            <span className="app-item-title">{w.title}</span>
            <span className="app-item-arrow"><ChevronRight size={16} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
