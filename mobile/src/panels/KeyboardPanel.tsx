import { useState, useRef, useEffect } from "react";
import { ws } from "../ws";
import { Copy, ClipboardPaste, Scissors, Undo, Redo, SquareAsterisk, Save, Search, Plus, X, Maximize, Settings, ClipboardCopy, Download, Upload } from "lucide-react";
import { hapticTap, hapticMedium, hapticClipboard, hapticSuccess } from "../haptics";

const SHORTCUTS = [
  { id: "sc-copy", label: "Copy", key: "ctrl+c", icon: <Copy size={24} /> },
  { id: "sc-paste", label: "Paste", key: "ctrl+v", icon: <ClipboardPaste size={24} /> },
  { id: "sc-cut", label: "Cut", key: "ctrl+x", icon: <Scissors size={24} /> },
  { id: "sc-undo", label: "Undo", key: "ctrl+z", icon: <Undo size={24} /> },
  { id: "sc-redo", label: "Redo", key: "ctrl+y", icon: <Redo size={24} /> },
  { id: "sc-selectall", label: "Select All", key: "ctrl+a", icon: <SquareAsterisk size={24} /> },
  { id: "sc-save", label: "Save", key: "ctrl+s", icon: <Save size={24} /> },
  { id: "sc-find", label: "Find", key: "ctrl+f", icon: <Search size={24} /> },
  { id: "sc-new-tab", label: "New Tab", key: "ctrl+t", icon: <Plus size={24} /> },
  { id: "sc-close-tab", label: "Close Tab", key: "ctrl+w", icon: <X size={24} /> },
  { id: "sc-fullscreen", label: "Fullscreen", key: "f11", icon: <Maximize size={24} /> },
  { id: "sc-task-mgr", label: "Task Mgr", key: "ctrl+shift+escape", icon: <Settings size={24} /> },
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
  const [activeTab, setActiveTab] = useState<"shortcuts" | "special" | "clipboard">("shortcuts");
  const [clipText, setClipText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  useEffect(() => {
    const removeHandler = ws.addMessageHandler((msg: any) => {
      if (msg.type === "clipboard_text") {
        setClipText(msg.text || "");
        hapticSuccess();
        showToast("📥 Retrieved PC clipboard!");
      }
    });
    return () => {
      removeHandler();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const sendKey = (key: string) => {
    // Combos (ctrl+, alt+, shift+) get a slightly heavier haptic
    if (key.includes("+")) hapticMedium(); else hapticTap();
    ws.send({ type: "key_press", key });
  };

  const handleSetClipboard = () => {
    hapticClipboard();
    ws.send({ type: "set_clipboard", text: clipText });
    showToast("📤 Sent to PC clipboard!");
  };

  const handleGetClipboard = () => {
    hapticClipboard();
    ws.send({ type: "get_clipboard" });
  };

  const copyToPhoneClipboard = (text: string) => {
    if (!text) {
      showToast("⚠️ Text box is empty!");
      return;
    }

    const performFallback = () => {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        textArea.style.pointerEvents = "none";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          showToast("📋 Copied to phone! (Fallback)");
        } else {
          showToast("⚠️ Copy failed. Select text to copy manually.");
        }
      } catch (err) {
        console.error("Fallback copy failed: ", err);
        showToast("⚠️ Copy failed. Please select text to copy.");
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => {
          showToast("📋 Copied to phone clipboard!");
        })
        .catch((err) => {
          console.warn("Clipboard API write failed, trying fallback: ", err);
          performFallback();
        });
    } else {
      performFallback();
    }
  };

  const pasteFromPhoneClipboard = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.readText()
        .then((text) => {
          setClipText(text);
          showToast("📝 Pasted phone clipboard!");
        })
        .catch((err) => {
          console.warn("Clipboard API read failed: ", err);
          showToast("⚠️ Access denied. Paste manually into the box.");
        });
    } else {
      showToast("⚠️ HTTP Blocked! Long-press box to paste.");
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // Compute diff between textInput and newValue
    let commonPrefixLen = 0;
    while (
      commonPrefixLen < textInput.length &&
      commonPrefixLen < newValue.length &&
      textInput[commonPrefixLen] === newValue[commonPrefixLen]
    ) {
      commonPrefixLen++;
    }

    const backspaces = textInput.length - commonPrefixLen;
    const addedText = newValue.slice(commonPrefixLen);

    // Send backspaces if any
    for (let i = 0; i < backspaces; i++) {
      ws.send({ type: "key_press", key: "backspace" });
    }

    // Send added text if any
    if (addedText) {
      ws.send({ type: "text", text: addedText });
    }

    setTextInput(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && textInput === "") {
      ws.send({ type: "key_press", key: "backspace" });
    } else if (e.key === "Enter") {
      ws.send({ type: "key_press", key: "enter" });
      setTextInput("");
    }
  };

  const handleClear = () => {
    setTextInput("");
    if (inputRef.current) {
      inputRef.current.focus();
    }
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
          placeholder="Type here in real-time..."
          value={textInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button
          id="btn-clear-text"
          className="send-btn"
          onClick={handleClear}
        >
          Clear
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
        <button
          id="tab-clipboard"
          className={`kb-tab ${activeTab === "clipboard" ? "active" : ""}`}
          onClick={() => setActiveTab("clipboard")}
        >
          Clipboard
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

      {/* Clipboard Sync Tab */}
      {activeTab === "clipboard" && (
        <div className="clipboard-sync-panel">
          <div className="clipboard-card">
            <div className="clipboard-header">
              <span className="clipboard-art"><ClipboardCopy size={24} /></span>
              <div className="clipboard-title-group">
                <span className="clipboard-title">Cross-Origin Clipboard Sync</span>
                <span className="clipboard-subtitle">Sync clipboard contents securely via WebSocket</span>
              </div>
            </div>

            <textarea
              className="clipboard-textarea"
              placeholder="Paste text here to send to PC, or tap 'Get PC Clipboard' to fetch..."
              value={clipText}
              onChange={(e) => setClipText(e.target.value)}
            />

            <div className="clipboard-actions">
              <button
                id="btn-get-pc-clipboard"
                className="clipboard-action-btn receive"
                onClick={handleGetClipboard}
                title="Fetch PC clipboard"
              >
                <Download size={16} /> Get from PC
              </button>
              <button
                id="btn-set-pc-clipboard"
                className="clipboard-action-btn send"
                onClick={handleSetClipboard}
                disabled={!clipText.trim()}
                title="Send text to PC clipboard"
              >
                <Upload size={16} /> Send to PC
              </button>
              <button
                id="btn-copy-local-clipboard"
                className="clipboard-action-btn local-copy"
                onClick={() => copyToPhoneClipboard(clipText)}
                title="Copy text to phone system clipboard"
              >
                <Copy size={16} /> Copy to Phone
              </button>
              <button
                id="btn-paste-local-clipboard"
                className="clipboard-action-btn local-paste"
                onClick={pasteFromPhoneClipboard}
                title="Paste text from phone system clipboard"
              >
                <ClipboardPaste size={16} /> Paste from Phone
              </button>
            </div>
          </div>

          {toastMessage && (
            <div className="clipboard-toast">
              {toastMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
