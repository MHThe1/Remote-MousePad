import { useState, useRef } from "react";
import { ws } from "../ws";

const SHORTCUTS = [
  { id: "sc-copy", label: "Copy", key: "ctrl+c", icon: "📋" },
  { id: "sc-paste", label: "Paste", key: "ctrl+v", icon: "📌" },
  { id: "sc-cut", label: "Cut", key: "ctrl+x", icon: "✂️" },
  { id: "sc-undo", label: "Undo", key: "ctrl+z", icon: "↩️" },
  { id: "sc-redo", label: "Redo", key: "ctrl+y", icon: "↪️" },
  { id: "sc-selectall", label: "Select All", key: "ctrl+a", icon: "🔲" },
  { id: "sc-save", label: "Save", key: "ctrl+s", icon: "💾" },
  { id: "sc-find", label: "Find", key: "ctrl+f", icon: "🔍" },
  { id: "sc-new-tab", label: "New Tab", key: "ctrl+t", icon: "➕" },
  { id: "sc-close-tab", label: "Close Tab", key: "ctrl+w", icon: "❌" },
  { id: "sc-fullscreen", label: "Fullscreen", key: "f11", icon: "🖥️" },
  { id: "sc-task-mgr", label: "Task Mgr", key: "ctrl+shift+escape", icon: "⚙️" },
];

const SPECIAL_KEYS = [
  { id: "key-esc", label: "Esc", key: "escape" },
  { id: "key-tab", label: "Tab", key: "tab" },
  { id: "key-caps", label: "Caps", key: "capslock" },
  { id: "key-ctrl", label: "Ctrl", key: "ctrl+ctrl", mod: true },
  { id: "key-alt", label: "Alt", key: "alt+alt", mod: true },
  { id: "key-win", label: "Win", key: "win+win", mod: true },
  { id: "key-backspace", label: "⌫", key: "backspace" },
  { id: "key-enter", label: "↵ Enter", key: "enter" },
  { id: "key-del", label: "Del", key: "delete" },
  { id: "key-home", label: "Home", key: "home" },
  { id: "key-end", label: "End", key: "end" },
  { id: "key-pgup", label: "PgUp", key: "pageup" },
  { id: "key-pgdn", label: "PgDn", key: "pagedown" },
  { id: "key-up", label: "▲", key: "up" },
  { id: "key-down", label: "▼", key: "down" },
  { id: "key-left", label: "◀", key: "left" },
  { id: "key-right", label: "▶", key: "right" },
];

export default function KeyboardPanel() {
  const [textInput, setTextInput] = useState("");
  const [activeTab, setActiveTab] = useState<"shortcuts" | "special">("shortcuts");
  const inputRef = useRef<HTMLInputElement>(null);

  const sendKey = (key: string) => {
    ws.send({ type: "key", key });
  };

  const sendText = () => {
    if (textInput.trim()) {
      ws.send({ type: "text", text: textInput });
      setTextInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendText();
  };

  return (
    <div className="keyboard-panel">
      {/* Text Input Row */}
      <div className="text-input-row">
        <input
          ref={inputRef}
          id="text-input-field"
          className="text-input"
          type="text"
          placeholder="Type here and press Send..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          id="btn-send-text"
          className="send-btn"
          onClick={sendText}
        >
          Send
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="kb-tabs">
        <button
          id="tab-shortcuts"
          className={`kb-tab ${activeTab === "shortcuts" ? "active" : ""}`}
          onClick={() => setActiveTab("shortcuts")}
        >
          Shortcuts
        </button>
        <button
          id="tab-special"
          className={`kb-tab ${activeTab === "special" ? "active" : ""}`}
          onClick={() => setActiveTab("special")}
        >
          Special Keys
        </button>
      </div>

      {/* Shortcuts Grid */}
      {activeTab === "shortcuts" && (
        <div className="shortcuts-grid">
          {SHORTCUTS.map((s) => (
            <button
              key={s.id}
              id={s.id}
              className="shortcut-btn"
              onTouchStart={(e) => { e.preventDefault(); sendKey(s.key); }}
              onClick={() => sendKey(s.key)}
            >
              <span className="shortcut-icon">{s.icon}</span>
              <span className="shortcut-label">{s.label}</span>
              <span className="shortcut-key">{s.key.replace(/\+/g, "+")} </span>
            </button>
          ))}
        </div>
      )}

      {/* Special Keys Grid */}
      {activeTab === "special" && (
        <div className="special-keys-grid">
          {SPECIAL_KEYS.map((k) => (
            <button
              key={k.id}
              id={k.id}
              className={`special-key-btn ${k.mod ? "modifier" : ""}`}
              onTouchStart={(e) => { e.preventDefault(); sendKey(k.key); }}
              onClick={() => sendKey(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
