import { useState, useEffect } from "react";
import { ws } from "./ws";
import TouchpadPanel from "./panels/TouchpadPanel";
import ScreenPanel from "./panels/ScreenPanel";
import KeyboardPanel from "./panels/KeyboardPanel";
import MediaPanel from "./panels/MediaPanel";
import PowerPanel from "./panels/PowerPanel";
import AppSwitcherPanel from "./panels/AppSwitcherPanel";
import "./index.css";

type Panel = "touchpad" | "screen" | "keyboard" | "media" | "power" | "apps";

const TABS: { id: Panel; icon: string; label: string }[] = [
  { id: "touchpad", icon: "🖱️", label: "Mouse" },
  { id: "screen", icon: "📺", label: "Screen" },
  { id: "keyboard", icon: "⌨️", label: "Keys" },
  { id: "media", icon: "🎵", label: "Media" },
  { id: "power", icon: "⚡", label: "Power" },
  { id: "apps", icon: "🪟", label: "Apps" },
];

export default function App() {
  const [panel, setPanel] = useState<Panel>("touchpad");
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(true);
  const [wsUrl, setWsUrl] = useState(() => {
    // Auto-detect: the WS server is on same host, port 9001
    const host = window.location.hostname;
    return `ws://${host}:9001`;
  });

  useEffect(() => {
    ws.setStatusChangeHandler((c) => setConnected(c));
    ws.connect(wsUrl);
    return () => ws.disconnect();
  }, []);

  const handleConnect = (url: string) => {
    setWsUrl(url);
    ws.disconnect();
    ws.connect(url);
    setShowConnect(false);
  };

  return (
    <div className="mobile-app">
      {/* Connection Screen */}
      {showConnect && (
        <ConnectScreen
          defaultUrl={wsUrl}
          onConnect={handleConnect}
          onSkip={() => setShowConnect(false)}
        />
      )}

      {/* Header */}
      <header className="mobile-header">
        <div className="mobile-logo">🖱️ MouseRemote</div>
        <div className={`conn-badge ${connected ? "conn" : "disconn"}`}>
          <span className="conn-dot"></span>
          {connected ? "Connected" : "Reconnecting..."}
        </div>
      </header>

      {/* Panel */}
      <main className="panel-area">
        {panel === "touchpad" && <TouchpadPanel />}
        {panel === "screen" && <ScreenPanel />}
        {panel === "keyboard" && <KeyboardPanel />}
        {panel === "media" && <MediaPanel />}
        {panel === "power" && <PowerPanel />}
        {panel === "apps" && <AppSwitcherPanel />}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className={`tab-btn ${panel === t.id ? "active" : ""}`}
            onClick={() => setPanel(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function ConnectScreen({
  defaultUrl,
  onConnect,
  onSkip,
}: {
  defaultUrl: string;
  onConnect: (url: string) => void;
  onSkip: () => void;
}) {
  const [url, setUrl] = useState(defaultUrl);

  return (
    <div className="connect-overlay">
      <div className="connect-modal">
        <div className="connect-logo">🖱️</div>
        <h1 className="connect-title">MouseRemote</h1>
        <p className="connect-subtitle">Enter your PC's WebSocket address</p>

        <div className="connect-input-row">
          <input
            id="ws-url-input"
            className="connect-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ws://192.168.x.x:9001"
          />
        </div>

        <button
          id="btn-connect"
          className="connect-btn"
          onClick={() => onConnect(url)}
        >
          Connect
        </button>
        <button
          id="btn-skip-connect"
          className="connect-skip"
          onClick={onSkip}
        >
          Auto-detect (same network)
        </button>
      </div>
    </div>
  );
}
