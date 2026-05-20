import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "react-qr-code";
import "./index.css";

interface ServerInfo {
  lan_ip: string;
  ws_port: number;
  http_port: number;
  connected_clients: number;
}

export default function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  const fetchInfo = async () => {
    try {
      const data = await invoke<ServerInfo>("get_server_info");
      setInfo(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchInfo();
    const interval = setInterval(fetchInfo, 2000);
    return () => clearInterval(interval);
  }, []);

  const mobileUrl = info
    ? `http://${info.lan_ip}:${info.http_port}`
    : "Loading...";

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🖱️</div>
          <span className="logo-text">MouseRemote</span>
        </div>
        <div className="status-badge">
          <span className="status-dot"></span>
          Running
        </div>
      </header>

      <main className="content">
        {/* QR Code Card */}
        <div className="qr-card">
          <span className="qr-label">Scan to Connect</span>
          <div className="qr-wrapper">
            {info ? (
              <QRCode
                value={mobileUrl}
                size={160}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox="0 0 160 160"
              />
            ) : (
              <div style={{ width: 160, height: 160, background: "#f0f0f0", borderRadius: 8 }} />
            )}
          </div>
          <span className="qr-url">{mobileUrl}</span>
          <span className="qr-hint">Open on your phone's browser — no app needed</span>
        </div>

        {/* Info Grid */}
        <div className="info-grid">
          <div className="info-card">
            <div className="info-card-label">Local IP</div>
            <div className="info-card-value accent">{info?.lan_ip ?? "—"}</div>
          </div>
          <div className="info-card">
            <div className="info-card-label">Connected</div>
            <div className={`info-card-value ${(info?.connected_clients ?? 0) > 0 ? "green" : ""}`}>
              {info?.connected_clients ?? 0} device{info?.connected_clients !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="info-card">
            <div className="info-card-label">HTTP Port</div>
            <div className="info-card-value">{info?.http_port ?? 9000}</div>
          </div>
          <div className="info-card">
            <div className="info-card-label">WS Port</div>
            <div className="info-card-value">{info?.ws_port ?? 9001}</div>
          </div>
        </div>

        {/* Connected Devices */}
        <div>
          <div className="section-title">Connection Status</div>
          <div className="client-count">
            <span className="client-count-label">Active phone connections</span>
            <span className="client-count-badge">{info?.connected_clients ?? 0}</span>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <div className="section-title">How to connect</div>
          <div className="instructions">
            <div className="step">
              <span className="step-num">1</span>
              <span>Make sure your phone is on the same Wi-Fi network as this PC</span>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <span>Scan the QR code above, or type <strong>{mobileUrl}</strong> in your phone's browser</span>
            </div>
            <div className="step">
              <span className="step-num">3</span>
              <span>Use the touchpad, keyboard, media, and power controls on your phone</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        MouseRemote v0.1.0 — Self-hosted wireless remote
      </footer>
    </div>
  );
}
