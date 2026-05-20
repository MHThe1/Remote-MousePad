import { useState, useEffect } from "react";
import { ws } from "../ws";
import {
  Loader2, RefreshCw, Monitor, ChevronRight, Globe, Code, Folder,
  FileText, Terminal, Music, MessageCircle, Users, Briefcase, Video,
  Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX,
  Maximize, Subtitles, Shuffle, Repeat, ChevronLeft, ChevronUp, ChevronDown,
  FastForward, Rewind, ListVideo, Mic, ThumbsUp, Clapperboard,
  ArrowLeft, LayoutTemplate
} from "lucide-react";
import { hapticAppSwitch, hapticTap, hapticMedium, hapticMedia, hapticSkip } from "../haptics";

/* ══════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════ */
type AppTab = "remotes" | "windows";

interface WindowInfo { id: number; title: string; }

interface RemoteBtn {
  id: string;
  label: string;
  icon: React.ReactNode;
  key: string;                 // keyboard shortcut sent to PC
  haptic?: () => void;
  accent?: boolean;            // highlight this button
  wide?: boolean;
  danger?: boolean;
}

interface RemoteRow { buttons: RemoteBtn[]; }

interface AppRemote {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;       // CSS color for accent
  description: string;
  rows: RemoteRow[];
}

/* ══════════════════════════════════════════════════════════════
   APP REMOTE DEFINITIONS
══════════════════════════════════════════════════════════════ */
const APP_REMOTES: AppRemote[] = [
  /* ── VLC ─────────────────────────────────────────────────── */
  {
    id: "vlc",
    name: "VLC",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#FF8800">
        <path d="M12 2L4 20H20L12 2M11 6H13V10H11V6M8.5 12.5H15.5L16.5 14.5H7.5L8.5 12.5M6 18H18L19 20H5L6 18Z"/>
      </svg>
    ),
    color: "#FF8800",
    description: "Media player",
    rows: [
      { buttons: [
        { id: "vlc-prev",    label: "Prev",    icon: <SkipBack size={20}/>,    key: "p",               haptic: hapticSkip },
        { id: "vlc-play",    label: "Play",    icon: <Play size={22}/>,        key: "space",           haptic: hapticMedia, accent: true },
        { id: "vlc-next",    label: "Next",    icon: <SkipForward size={20}/>, key: "n",               haptic: hapticSkip },
      ]},
      { buttons: [
        { id: "vlc-rew30",   label: "-30s",    icon: <Rewind size={18}/>,      key: "ctrl+left",       haptic: hapticTap },
        { id: "vlc-rew10",   label: "-10s",    icon: <ChevronLeft size={18}/>, key: "alt+left",        haptic: hapticTap },
        { id: "vlc-fwd10",   label: "+10s",    icon: <ChevronRight size={18}/>,key: "alt+right",       haptic: hapticTap },
        { id: "vlc-fwd30",   label: "+30s",    icon: <FastForward size={18}/>, key: "ctrl+right",      haptic: hapticTap },
      ]},
      { buttons: [
        { id: "vlc-vol-dn",  label: "Vol −",   icon: <Volume1 size={18}/>,     key: "ctrl+down",       haptic: hapticTap },
        { id: "vlc-mute",    label: "Mute",    icon: <VolumeX size={18}/>,     key: "m",               haptic: hapticTap },
        { id: "vlc-vol-up",  label: "Vol +",   icon: <Volume2 size={18}/>,     key: "ctrl+up",         haptic: hapticTap },
      ]},
      { buttons: [
        { id: "vlc-full",    label: "Fullscr", icon: <Maximize size={18}/>,    key: "f",               haptic: hapticTap },
        { id: "vlc-sub",     label: "Subtitle",icon: <Subtitles size={18}/>,   key: "v",               haptic: hapticTap },
        { id: "vlc-audio",   label: "Audio",   icon: <Mic size={18}/>,         key: "b",               haptic: hapticTap },
      ]},
    ],
  },

  /* ── YouTube ──────────────────────────────────────────────── */
  {
    id: "youtube",
    name: "YouTube",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#FF0000">
        <path d="M21.58 7.19C21.35 6.31 20.69 5.65 19.81 5.42C18.25 5 12 5 12 5C12 5 5.75 5 4.19 5.42C3.31 5.65 2.65 6.31 2.42 7.19C2 8.75 2 12 2 12C2 12 2 15.25 2.42 16.81C2.65 17.69 3.31 18.35 4.19 18.58C5.75 19 12 19 12 19C12 19 18.25 19 19.81 18.58C20.69 18.35 21.35 17.69 21.58 16.81C22 15.25 22 12 22 12C22 12 22 8.75 21.58 7.19ZM10 15V9L15.2 12L10 15Z"/>
      </svg>
    ),
    color: "#FF0000",
    description: "YouTube in browser",
    rows: [
      { buttons: [
        { id: "yt-prev",     label: "Prev",    icon: <SkipBack size={20}/>,    key: "shift+p",         haptic: hapticSkip },
        { id: "yt-play",     label: "Play",    icon: <Play size={22}/>,        key: "k",               haptic: hapticMedia, accent: true },
        { id: "yt-next",     label: "Next",    icon: <SkipForward size={20}/>, key: "shift+n",         haptic: hapticSkip },
      ]},
      { buttons: [
        { id: "yt-rew10",    label: "-10s",    icon: <ChevronLeft size={18}/>, key: "j",               haptic: hapticTap },
        { id: "yt-rew5",     label: "-5s",     icon: <Rewind size={18}/>,      key: "left",            haptic: hapticTap },
        { id: "yt-fwd5",     label: "+5s",     icon: <FastForward size={18}/>, key: "right",           haptic: hapticTap },
        { id: "yt-fwd10",    label: "+10s",    icon: <ChevronRight size={18}/>,key: "l",               haptic: hapticTap },
      ]},
      { buttons: [
        { id: "yt-vol-dn",   label: "Vol −",   icon: <ChevronDown size={18}/>, key: "down",            haptic: hapticTap },
        { id: "yt-mute",     label: "Mute",    icon: <VolumeX size={18}/>,     key: "m",               haptic: hapticTap },
        { id: "yt-vol-up",   label: "Vol +",   icon: <ChevronUp size={18}/>,   key: "up",              haptic: hapticTap },
      ]},
      { buttons: [
        { id: "yt-full",     label: "Fullscr", icon: <Maximize size={18}/>,    key: "f",               haptic: hapticTap },
        { id: "yt-caption",  label: "Captions",icon: <Subtitles size={18}/>,   key: "c",               haptic: hapticTap },
        { id: "yt-theater",  label: "Theater", icon: <LayoutTemplate size={18}/>, key: "t",            haptic: hapticTap },
      ]},
    ],
  },

  /* ── Netflix ──────────────────────────────────────────────── */
  {
    id: "netflix",
    name: "Netflix",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#E50914">
        <path d="M19.78 20L19 15V4H15V13.5L8.5 4H5V20H9V9.5L15.5 19.5H19.78Z"/>
      </svg>
    ),
    color: "#E50914",
    description: "Netflix in browser",
    rows: [
      { buttons: [
        { id: "nf-play",     label: "Play",    icon: <Play size={22}/>,        key: "space",           haptic: hapticMedia, accent: true, wide: true },
      ]},
      { buttons: [
        { id: "nf-rew10",    label: "−10s",    icon: <Rewind size={20}/>,      key: "shift+left",      haptic: hapticTap },
        { id: "nf-fwd10",    label: "+10s",    icon: <FastForward size={20}/>, key: "shift+right",     haptic: hapticTap },
      ]},
      { buttons: [
        { id: "nf-vol-dn",   label: "Vol −",   icon: <Volume1 size={18}/>,     key: "down",            haptic: hapticTap },
        { id: "nf-mute",     label: "Mute",    icon: <VolumeX size={18}/>,     key: "m",               haptic: hapticTap },
        { id: "nf-vol-up",   label: "Vol +",   icon: <Volume2 size={18}/>,     key: "up",              haptic: hapticTap },
      ]},
      { buttons: [
        { id: "nf-full",     label: "Fullscr", icon: <Maximize size={18}/>,    key: "f",               haptic: hapticTap },
        { id: "nf-episode",  label: "Next Ep", icon: <SkipForward size={18}/>, key: "shift+right",     haptic: hapticSkip },
        { id: "nf-sub",      label: "Subtitle",icon: <Subtitles size={18}/>,   key: "s",               haptic: hapticTap },
      ]},
    ],
  },

  /* ── Stremio ──────────────────────────────────────────────── */
  {
    id: "stremio",
    name: "Stremio",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#7B5EA7">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
      </svg>
    ),
    color: "#7B5EA7",
    description: "Stremio player",
    rows: [
      { buttons: [
        { id: "st-prev",     label: "Prev Ep", icon: <SkipBack size={20}/>,    key: "ctrl+left",       haptic: hapticSkip },
        { id: "st-play",     label: "Play",    icon: <Play size={22}/>,        key: "space",           haptic: hapticMedia, accent: true },
        { id: "st-next",     label: "Next Ep", icon: <SkipForward size={20}/>, key: "ctrl+right",      haptic: hapticSkip },
      ]},
      { buttons: [
        { id: "st-rew30",    label: "−30s",    icon: <Rewind size={18}/>,      key: "shift+left",      haptic: hapticTap },
        { id: "st-rew5",     label: "−5s",     icon: <ChevronLeft size={18}/>, key: "left",            haptic: hapticTap },
        { id: "st-fwd5",     label: "+5s",     icon: <ChevronRight size={18}/>,key: "right",           haptic: hapticTap },
        { id: "st-fwd30",    label: "+30s",    icon: <FastForward size={18}/>, key: "shift+right",     haptic: hapticTap },
      ]},
      { buttons: [
        { id: "st-vol-dn",   label: "Vol −",   icon: <Volume1 size={18}/>,     key: "down",            haptic: hapticTap },
        { id: "st-mute",     label: "Mute",    icon: <VolumeX size={18}/>,     key: "m",               haptic: hapticTap },
        { id: "st-vol-up",   label: "Vol +",   icon: <Volume2 size={18}/>,     key: "up",              haptic: hapticTap },
      ]},
      { buttons: [
        { id: "st-full",     label: "Fullscr", icon: <Maximize size={18}/>,    key: "f",               haptic: hapticTap },
        { id: "st-sub",      label: "Subtitle",icon: <Subtitles size={18}/>,   key: "s",               haptic: hapticTap },
      ]},
    ],
  },

  /* ── Spotify ──────────────────────────────────────────────── */
  {
    id: "spotify",
    name: "Spotify",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#1DB954">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.6 14.4c-.2.3-.6.4-.9.2-2.4-1.5-5.5-1.8-9.1-1-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 4-1 7.5-.6 10.2 1 .3.2.4.6.2 1zm1.3-2.9c-.3.4-.8.5-1.1.2-2.8-1.7-7.1-2.2-10.4-1.2-.5.1-1-.2-1.1-.6-.1-.5.2-1 .6-1.1 3.8-1.2 8.6-.6 11.8 1.4.4.3.5.8.2 1.3zm.1-3C14.7 8.5 8.5 8.3 5 9.4c-.6.2-1.2-.1-1.4-.7-.2-.6.1-1.2.7-1.4 4-.1 10.9.1 14.7 2.4.5.3.7 1 .4 1.5-.3.6-.9.8-1.4.5z"/>
      </svg>
    ),
    color: "#1DB954",
    description: "Spotify app",
    rows: [
      { buttons: [
        { id: "sp-prev",     label: "Prev",    icon: <SkipBack size={20}/>,    key: "ctrl+left",       haptic: hapticSkip },
        { id: "sp-play",     label: "Play",    icon: <Play size={22}/>,        key: "space",           haptic: hapticMedia, accent: true },
        { id: "sp-next",     label: "Next",    icon: <SkipForward size={20}/>, key: "ctrl+right",      haptic: hapticSkip },
      ]},
      { buttons: [
        { id: "sp-vol-dn",   label: "Vol −",   icon: <Volume1 size={18}/>,     key: "ctrl+shift+down", haptic: hapticTap },
        { id: "sp-mute",     label: "Mute",    icon: <VolumeX size={18}/>,     key: "ctrl+shift+m",    haptic: hapticTap },
        { id: "sp-vol-up",   label: "Vol +",   icon: <Volume2 size={18}/>,     key: "ctrl+shift+up",   haptic: hapticTap },
      ]},
      { buttons: [
        { id: "sp-shuffle",  label: "Shuffle", icon: <Shuffle size={18}/>,     key: "ctrl+s",          haptic: hapticTap },
        { id: "sp-repeat",   label: "Repeat",  icon: <Repeat size={18}/>,      key: "ctrl+r",          haptic: hapticTap },
        { id: "sp-like",     label: "Like",    icon: <ThumbsUp size={18}/>,    key: "alt+shift+b",     haptic: hapticMedium },
        { id: "sp-queue",    label: "Queue",   icon: <ListVideo size={18}/>,   key: "ctrl+q",          haptic: hapticTap },
      ]},
    ],
  },

  /* ── Plex ─────────────────────────────────────────────────── */
  {
    id: "plex",
    name: "Plex",
    icon: (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="#E5A00D">
        <path d="M12 2L22 12L12 22L2 12L12 2Z M10.5 7.5L6 12L10.5 16.5V7.5Z M13.5 7.5V16.5L18 12L13.5 7.5Z"/>
      </svg>
    ),
    color: "#E5A00D",
    description: "Plex Media Server",
    rows: [
      { buttons: [
        { id: "plex-prev",   label: "Prev",    icon: <SkipBack size={20}/>,    key: "shift+p",         haptic: hapticSkip },
        { id: "plex-play",   label: "Play",    icon: <Play size={22}/>,        key: "space",           haptic: hapticMedia, accent: true },
        { id: "plex-next",   label: "Next",    icon: <SkipForward size={20}/>, key: "shift+n",         haptic: hapticSkip },
      ]},
      { buttons: [
        { id: "plex-rew30",  label: "−30s",    icon: <Rewind size={18}/>,      key: "shift+left",      haptic: hapticTap },
        { id: "plex-rew10",  label: "−10s",    icon: <ChevronLeft size={18}/>, key: "left",            haptic: hapticTap },
        { id: "plex-fwd10",  label: "+10s",    icon: <ChevronRight size={18}/>,key: "right",           haptic: hapticTap },
        { id: "plex-fwd30",  label: "+30s",    icon: <FastForward size={18}/>, key: "shift+right",     haptic: hapticTap },
      ]},
      { buttons: [
        { id: "plex-vol-dn", label: "Vol −",   icon: <Volume1 size={18}/>,     key: "down",            haptic: hapticTap },
        { id: "plex-mute",   label: "Mute",    icon: <VolumeX size={18}/>,     key: "m",               haptic: hapticTap },
        { id: "plex-vol-up", label: "Vol +",   icon: <Volume2 size={18}/>,     key: "up",              haptic: hapticTap },
      ]},
      { buttons: [
        { id: "plex-full",   label: "Fullscr", icon: <Maximize size={18}/>,    key: "f",               haptic: hapticTap },
        { id: "plex-sub",    label: "Subtitle",icon: <Subtitles size={18}/>,   key: "s",               haptic: hapticTap },
        { id: "plex-next-ep",label: "Next Ep", icon: <Clapperboard size={18}/>,key: "shift+n",         haptic: hapticSkip },
      ]},
    ],
  },
];

/* ══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════ */

/* ── App Remote Card Grid ─────────────────────────────────────── */
function AppRemoteGrid({ selected, onSelect }: {
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="app-remote-grid">
      {APP_REMOTES.map((app) => (
        <button
          key={app.id}
          id={`remote-${app.id}`}
          className={`app-remote-card ${selected === app.id ? "active" : ""}`}
          style={{ "--app-color": app.color } as React.CSSProperties}
          onClick={() => { hapticTap(); onSelect(app.id); }}
        >
          <span className="app-remote-icon">{app.icon}</span>
          <span className="app-remote-name">{app.name}</span>
          <span className="app-remote-desc">{app.description}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Remote Control Panel ─────────────────────────────────────── */
function AppRemoteControls({ app, onBack }: { app: AppRemote; onBack: () => void }) {
  const sendKey = (btn: RemoteBtn) => {
    (btn.haptic ?? hapticTap)();
    ws.send({ type: "key_press", key: btn.key });
  };

  return (
    <div className="app-remote-controls">
      {/* Header */}
      <div className="arc-header" style={{ "--app-color": app.color } as React.CSSProperties}>
        <button className="arc-back-btn" onClick={() => { hapticTap(); onBack(); }}>
          <ArrowLeft size={18} />
        </button>
        <span className="arc-icon">{app.icon}</span>
        <span className="arc-title">{app.name}</span>
        <span className="arc-desc">{app.description}</span>
      </div>

      {/* Button rows */}
      <div className="arc-rows">
        {app.rows.map((row, ri) => (
          <div key={ri} className="arc-row">
            {row.buttons.map((btn) => (
              <button
                key={btn.id}
                id={btn.id}
                className={`arc-btn ${btn.accent ? "arc-btn-accent" : ""} ${btn.wide ? "arc-btn-wide" : ""} ${btn.danger ? "arc-btn-danger" : ""}`}
                style={btn.accent ? { "--app-color": app.color } as React.CSSProperties : undefined}
                onClick={() => sendKey(btn)}
              >
                <span className="arc-btn-icon">{btn.icon}</span>
                <span className="arc-btn-label">{btn.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Window Switcher ──────────────────────────────────────────── */
function WindowSwitcher() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const fetchWindows = () => { setLoading(true); ws.send({ type: "get_windows" }); };

  useEffect(() => {
    const unsubscribe = ws.addMessageHandler((msg: any) => {
      if (msg.type === "windows_list") { setWindows(msg.windows || []); setLoading(false); }
    });
    if (ws.connected) fetchWindows();
    return () => { unsubscribe(); };
  }, []);

  const focusWindow = (id: number) => { hapticAppSwitch(); ws.send({ type: "focus_window", id }); };

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
    if (t.includes("word") || t.includes("excel")) return <FileText size={20} />;
    if (t.includes("powerpoint") || t.includes("zoom")) return <Video size={20} />;
    if (t.includes("teams")) return <Users size={20} />;
    if (t.includes("slack")) return <Briefcase size={20} />;
    return <Monitor size={20} />;
  };

  return (
    <div className="window-switcher">
      <div className="app-switcher-header">
        <input
          id="app-filter-input"
          className="app-filter"
          type="text"
          placeholder="Filter windows..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          id="btn-refresh-windows"
          className="refresh-btn"
          onClick={() => { hapticTap(); fetchWindows(); }}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </button>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon"><Monitor size={40} strokeWidth={1.5} /></div>
          <p>{windows.length === 0 ? "Tap refresh to load open windows" : "No windows match your search"}</p>
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

/* ══════════════════════════════════════════════════════════════
   MAIN PANEL
══════════════════════════════════════════════════════════════ */
export default function AppSwitcherPanel() {
  const [appTab, setAppTab] = useState<AppTab>("remotes");
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);

  const activeApp = APP_REMOTES.find((a) => a.id === selectedRemote) ?? null;

  const switchTab = (t: AppTab) => { hapticTap(); setAppTab(t); };

  return (
    <div className="app-switcher-panel">
      {/* Sub-tab bar */}
      <div className="apps-tab-bar">
        <button
          id="apps-tab-remotes"
          className={`apps-tab-btn ${appTab === "remotes" ? "active" : ""}`}
          onClick={() => switchTab("remotes")}
        >
          App Remotes
        </button>
        <button
          id="apps-tab-windows"
          className={`apps-tab-btn ${appTab === "windows" ? "active" : ""}`}
          onClick={() => switchTab("windows")}
        >
          Windows
        </button>
      </div>

      {/* Content */}
      {appTab === "remotes" && (
        activeApp
          ? <AppRemoteControls app={activeApp} onBack={() => setSelectedRemote(null)} />
          : <AppRemoteGrid selected={selectedRemote} onSelect={setSelectedRemote} />
      )}

      {appTab === "windows" && <WindowSwitcher />}
    </div>
  );
}
