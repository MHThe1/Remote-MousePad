import { useState, useEffect } from "react";
import { ws } from "../ws";

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

  // Emoji for common apps
  const getIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("chrome") || t.includes("chromium")) return "🌐";
    if (t.includes("firefox")) return "🦊";
    if (t.includes("edge")) return "🌀";
    if (t.includes("code") || t.includes("vscode")) return "💻";
    if (t.includes("explorer")) return "📁";
    if (t.includes("notepad")) return "📝";
    if (t.includes("terminal") || t.includes("powershell") || t.includes("cmd")) return "⌨️";
    if (t.includes("spotify")) return "🎵";
    if (t.includes("discord")) return "💬";
    if (t.includes("word")) return "📄";
    if (t.includes("excel")) return "📊";
    if (t.includes("powerpoint")) return "📊";
    if (t.includes("teams")) return "👥";
    if (t.includes("slack")) return "💼";
    if (t.includes("zoom")) return "📹";
    return "🖥️";
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
          {loading ? "⏳" : "🔄"}
        </button>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">🖥️</div>
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
            <span className="app-item-arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
