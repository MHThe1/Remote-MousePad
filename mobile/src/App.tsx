import { useState, useEffect } from "react";
import { ws } from "./ws";
import TouchpadPanel from "./panels/TouchpadPanel";
import ScreenPanel from "./panels/ScreenPanel";
import KeyboardPanel from "./panels/KeyboardPanel";
import MediaPanel from "./panels/MediaPanel";
import PowerPanel from "./panels/PowerPanel";
import AppSwitcherPanel from "./panels/AppSwitcherPanel";
import { MousePointer2, Monitor, Keyboard, Music, Power, LayoutGrid, Mouse } from "lucide-react";
import { hapticTabChange, hapticSuccess, hapticError, hapticTest, hapticSupported, canVibrate, isIOS, getHapticAudio, setHapticAudio } from "./haptics";
import "./index.css";

type Panel = "touchpad" | "screen" | "keyboard" | "media" | "power" | "apps";

const TABS: { id: Panel; icon: React.ReactNode; label: string }[] = [
  { id: "touchpad", icon: <MousePointer2 size={24} />, label: "Mouse" },
  { id: "screen", icon: <Monitor size={24} />, label: "Screen" },
  { id: "keyboard", icon: <Keyboard size={24} />, label: "Keys" },
  { id: "media", icon: <Music size={24} />, label: "Media" },
  { id: "power", icon: <Power size={24} />, label: "Power" },
  { id: "apps", icon: <LayoutGrid size={24} />, label: "Apps" },
];

export default function App() {
  const [panel, setPanel] = useState<Panel>("touchpad");
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(true);
  const [audioHaptic, setAudioHaptic] = useState(getHapticAudio);
  const [wsUrl, setWsUrl] = useState(() => {
    // Auto-detect: the WS server is on same host, port 9001
    const host = window.location.hostname;
    return `ws://${host}:9001`;
  });

  useEffect(() => {
    ws.setStatusChangeHandler((c) => {
      setConnected(c);
      if (c) hapticSuccess(); else hapticError();
    });
    ws.connect(wsUrl);
    return () => ws.disconnect();
  }, []);

  const handleConnect = (url: string) => {
    hapticTest(); // prime Vibration API on first real user gesture
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
        <div className="mobile-logo">
          <Mouse size={24} strokeWidth={2.5} className="logo-icon" /> 
          MouseRemote
        </div>
        <div className={`conn-badge ${connected ? "conn" : "disconn"}`}>
          <span className="conn-dot"></span>
          {connected ? "Connected" : "Reconnecting..."}
        </div>
        {/* Haptic / Audio indicator — tap to toggle on iOS, test on Android */}
        <button
          id="btn-haptic-test"
          className={`haptic-indicator ${isIOS && !audioHaptic ? "haptic-muted" : ""}`}
          title={
            canVibrate ? "Tap to test vibration" :
            isIOS ? (audioHaptic ? "Tap sounds ON — tap to mute" : "Tap sounds OFF — tap to enable") :
            "No haptic support"
          }
          onClick={() => {
            if (isIOS) {
              const next = !audioHaptic;
              setHapticAudio(next);
              setAudioHaptic(next);
              if (next) hapticTest();
            } else {
              hapticTest();
            }
          }}
        >
          {canVibrate ? "📳" : isIOS ? (audioHaptic ? "🔊" : "🔕") : ""}
        </button>
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
            onClick={() => { hapticTabChange(); setPanel(t.id); }}
          >
            <div className="tab-icon-wrapper">
              <span className="tab-icon">{t.icon}</span>
            </div>
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
        <div className="connect-logo">
          <Mouse size={48} strokeWidth={2} />
        </div>
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
          onClick={() => { hapticTest(); onConnect(url); }}
        >
          Connect
        </button>
        <button
          id="btn-skip-connect"
          className="connect-skip"
          onClick={() => { hapticTest(); onSkip(); }}
        >
          Auto-detect (same network)
        </button>
      </div>
    </div>
  );
}
