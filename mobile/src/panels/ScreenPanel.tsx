import { useState, useEffect, useRef, useCallback } from "react";
import { ws } from "../ws";

/* ── Types ──────────────────────────────────────────────────── */
interface PCDimensions {
  width: number;
  height: number;
}

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  is_primary: boolean;
}

/* ── Helpers ────────────────────────────────────────────────── */
function dist(a: React.Touch, b: React.Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: React.Touch, b: React.Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.5;

/* ════════════════════════════════════════════════════════════ */
export default function ScreenPanel() {
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [pcDimensions, setPcDimensions] = useState<PCDimensions>({
    width: 1920,
    height: 1080,
  });
  const [clickMode, setClickMode] = useState<"left" | "right" | "double">(
    "left"
  );
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState("");

  // Monitor state
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [activeMonitor, setActiveMonitor] = useState(0);

  // Zoom / pan state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // PiP state
  const [pip, setPip] = useState(false);
  const [pipPos, setPipPos] = useState({ x: 16, y: 16 }); // distance from top-right

  const imageRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Touch tracking refs (avoid re-renders)
  const touchState = useRef({
    lastTouchCount: 0,
    lastPinchDist: 0,
    lastPinchMid: { x: 0, y: 0 },
    lastSinglePos: { x: 0, y: 0 },
    isDragging: false,
    // PiP drag
    pipDragging: false,
    pipDragStart: { touchX: 0, touchY: 0, posX: 0, posY: 0 },
  });

  // Keep zoom/pan in a ref so touch handlers don't stale-close
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: panX, y: panY });
  zoomRef.current = zoom;
  panRef.current = { x: panX, y: panY };

  /* ── WebSocket lifecycle ─────────────────────────────────── */
  useEffect(() => {
    // Request monitor list on mount
    ws.send({ type: "get_monitors" });

    // Start stream on default monitor
    ws.send({ type: "start_screen_stream", monitor_index: 0 });

    const removeHandler = ws.addMessageHandler((msg: any) => {
      if (msg.type === "monitors_list") {
        setMonitors(msg.monitors || []);
      } else if (msg.type === "screen_info") {
        setPcDimensions({
          width: msg.width || 1920,
          height: msg.height || 1080,
        });
      } else if (msg.type === "screen_frame") {
        setFrameSrc(msg.image || "");
      }
    });

    return () => {
      ws.send({ type: "stop_screen_stream" });
      removeHandler();
    };
  }, []);

  /* ── Monitor switching ───────────────────────────────────── */
  const switchMonitor = (idx: number) => {
    if (idx === activeMonitor) return;
    setActiveMonitor(idx);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    ws.send({ type: "stop_screen_stream" });
    ws.send({ type: "start_screen_stream", monitor_index: idx });
  };

  /* ── Coordinate mapping ──────────────────────────────────── */
  const clientToPC = useCallback(
    (clientX: number, clientY: number) => {
      if (!imageRef.current) return null;
      const rect = imageRef.current.getBoundingClientRect();

      // When zoomed, the rendered image is "transform: scale(zoom)" from its origin.
      // We need to map click inside the visible (clipped) area back to the real image coords.
      const z = zoomRef.current;
      const px = panRef.current.x;
      const py = panRef.current.y;

      // Work in CSS-pixel space on the image element
      const imgW = rect.width;
      const imgH = rect.height;

      const rawImgX = clientX - rect.left; // CSS pixels inside img element
      const rawImgY = clientY - rect.top;

      // Invert the CSS transform: translate(panX px, panY px) scale(zoom)
      // transformed point = zoom*(orig + pan)
      // => orig = (point/zoom) - pan
      const origX = rawImgX / z - px;
      const origY = rawImgY / z - py;

      const fracX = origX / imgW;
      const fracY = origY / imgH;

      const absX = Math.round(Math.max(0, Math.min(1, fracX)) * pcDimensions.width);
      const absY = Math.round(
        Math.max(0, Math.min(1, fracY)) * pcDimensions.height
      );
      return { x: absX, y: absY };
    },
    [pcDimensions]
  );

  /* ── Click / interaction ─────────────────────────────────── */
  const doClick = useCallback(
    (clientX: number, clientY: number) => {
      const pc = clientToPC(clientX, clientY);
      if (!pc) return;
      ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });

      if (clickMode === "left") {
        ws.send({ type: "mouse_click", button: "left" });
      } else if (clickMode === "right") {
        ws.send({ type: "mouse_click", button: "right" });
      } else {
        ws.send({ type: "mouse_click", button: "left" });
        setTimeout(() => ws.send({ type: "mouse_click", button: "left" }), 80);
      }
    },
    [clickMode, clientToPC]
  );

  /* ── Clamp pan so image can't be panned off-screen ───────── */
  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      if (!imageRef.current) return { x: px, y: py };
      const rect = imageRef.current.getBoundingClientRect();
      const imgW = rect.width;
      const imgH = rect.height;
      // max pan in CSS pixels of the underlying image
      const maxPx = (imgW * (z - 1)) / z;
      const maxPy = (imgH * (z - 1)) / z;
      return {
        x: Math.max(-maxPx, Math.min(0, px)),
        y: Math.max(-maxPy, Math.min(0, py)),
      };
    },
    []
  );

  /* ── Touch handlers ──────────────────────────────────────── */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      const ts = touchState.current;
      ts.lastTouchCount = e.touches.length;

      if (e.touches.length === 2) {
        // Init pinch
        ts.lastPinchDist = dist(e.touches[0], e.touches[1]);
        ts.lastPinchMid = midpoint(e.touches[0], e.touches[1]);
        ts.isDragging = false;
      } else if (e.touches.length === 1) {
        ts.lastSinglePos = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        ts.isDragging = false;
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      const ts = touchState.current;

      if (e.touches.length === 2) {
        // ── Pinch-to-zoom ──────────────────────────────────────
        const newDist = dist(e.touches[0], e.touches[1]);
        const ratio = newDist / (ts.lastPinchDist || newDist);
        ts.lastPinchDist = newDist;

        setZoom((prev) => {
          const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev * ratio));
          zoomRef.current = next;
          return next;
        });
        ts.isDragging = false;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - ts.lastSinglePos.x;
        const dy = t.clientY - ts.lastSinglePos.y;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) ts.isDragging = true;

        if (zoomRef.current > 1.05) {
          // ── Pan while zoomed ─────────────────────────────────
          setPanX((px) => {
            const next = px + dx / zoomRef.current;
            const clamped = clampPan(next, panRef.current.y, zoomRef.current);
            panRef.current.x = clamped.x;
            return clamped.x;
          });
          setPanY((py) => {
            const next = py + dy / zoomRef.current;
            const clamped = clampPan(panRef.current.x, next, zoomRef.current);
            panRef.current.y = clamped.y;
            return clamped.y;
          });
        } else {
          // ── Move PC cursor ───────────────────────────────────
          const pc = clientToPC(t.clientX, t.clientY);
          if (pc) ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });
        }

        ts.lastSinglePos = { x: t.clientX, y: t.clientY };
      }
    },
    [clampPan, clientToPC]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      const ts = touchState.current;
      // Tap = touch ended without significant drag
      if (!ts.isDragging && ts.lastTouchCount === 1 && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        doClick(t.clientX, t.clientY);
      }
      ts.isDragging = false;
      ts.lastTouchCount = e.touches.length;
    },
    [doClick]
  );

  /* ── Mouse fallback (desktop testing) ───────────────────── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 0) doClick(e.clientX, e.clientY);
    },
    [doClick]
  );

  /* ── Zoom controls ───────────────────────────────────────── */
  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(1))));
  const zoomOut = () => {
    setZoom((z) => {
      const next = Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(1)));
      if (next <= 1) { setPanX(0); setPanY(0); }
      return next;
    });
  };
  const zoomReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  /* ── PiP drag ────────────────────────────────────────────── */
  const handlePipTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const ts = touchState.current;
    ts.pipDragging = true;
    ts.pipDragStart = {
      touchX: e.touches[0].clientX,
      touchY: e.touches[0].clientY,
      posX: pipPos.x,
      posY: pipPos.y,
    };
  };

  const handlePipTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!touchState.current.pipDragging) return;
    const ds = touchState.current.pipDragStart;
    const dx = e.touches[0].clientX - ds.touchX;
    const dy = e.touches[0].clientY - ds.touchY;
    setPipPos({
      x: Math.max(8, ds.posX - dx),  // x = right offset
      y: Math.max(8, ds.posY + dy),
    });
  };

  const handlePipTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    touchState.current.pipDragging = false;
  };

  /* ── Keyboard (Quick Type) ───────────────────────────────── */
  const toggleKeyboard = () => {
    setShowKeyboard((v) => !v);
    if (!showKeyboard) setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
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
    for (let i = 0; i < backspaces; i++)
      ws.send({ type: "key_press", key: "backspace" });
    if (addedText) ws.send({ type: "text", text: addedText });
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

  /* ── The stream image element (shared between full + PiP) ── */
  const streamContent = (
    <div
      className="screen-zoom-wrapper"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      {frameSrc ? (
        <div
          className="screen-img-transformable"
          style={{
            transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
            transformOrigin: "0 0",
          }}
        >
          <img
            ref={imageRef}
            src={frameSrc}
            alt="PC Desktop View"
            className="screen-img-display"
            draggable={false}
          />
        </div>
      ) : (
        <div className="screen-placeholder">
          <span className="screen-loader">📺</span>
          <span className="screen-loading-text">Connecting to Live Feed…</span>
        </div>
      )}

      {/* Zoom badge */}
      {zoom > 1.05 && (
        <div className="zoom-badge">{zoom.toFixed(1)}×</div>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="screen-stream-panel">
      {/* Monitor picker (shown only when > 1 monitor) */}
      {monitors.length > 1 && (
        <div className="monitor-picker">
          {monitors.map((m) => (
            <button
              key={m.index}
              className={`monitor-chip ${activeMonitor === m.index ? "active" : ""}`}
              onClick={() => switchMonitor(m.index)}
              id={`monitor-chip-${m.index}`}
            >
              🖥️ {m.name || `Display ${m.index + 1}`}
              {m.is_primary && <span className="monitor-primary-badge">●</span>}
            </button>
          ))}
        </div>
      )}

      {/* Quick Keyboard input row */}
      {showKeyboard && (
        <div className="screen-keyboard-row">
          <input
            ref={inputRef}
            className="screen-keyboard-input"
            type="text"
            placeholder="Quick type onto PC…"
            value={textInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button className="screen-keyboard-clear" onClick={() => setTextInput("")}>
            ✕
          </button>
        </div>
      )}

      {/* Screen canvas / full view */}
      {!pip && (
        <div className="screen-canvas-wrapper" ref={wrapperRef}>
          {streamContent}
        </div>
      )}

      {/* PiP floating overlay */}
      {pip && (
        <div
          className="pip-overlay"
          style={{ right: pipPos.x, top: pipPos.y }}
        >
          <div
            className="pip-drag-handle"
            onTouchStart={handlePipTouchStart}
            onTouchMove={handlePipTouchMove}
            onTouchEnd={handlePipTouchEnd}
          >
            <span className="pip-handle-dots">⋮⋮</span>
            <span className="pip-label">PiP</span>
            <button
              className="pip-expand-btn"
              onClick={() => setPip(false)}
              title="Expand"
            >
              ⛶
            </button>
          </div>
          {streamContent}
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div className="screen-floating-toolbar">
        {/* Click mode */}
        <button
          className={`toolbar-action-btn ${clickMode === "left" ? "active" : ""}`}
          onClick={() => setClickMode("left")}
          id="btn-click-left"
          title="Left Click"
        >
          🖱️L
        </button>
        <button
          className={`toolbar-action-btn ${clickMode === "right" ? "active" : ""}`}
          onClick={() => setClickMode("right")}
          id="btn-click-right"
          title="Right Click"
        >
          🖱️R
        </button>
        <button
          className={`toolbar-action-btn ${clickMode === "double" ? "active" : ""}`}
          onClick={() => setClickMode("double")}
          id="btn-click-double"
          title="Double Click"
        >
          🖱️2×
        </button>

        <div className="toolbar-divider" />

        {/* Zoom controls */}
        <button
          className="toolbar-action-btn"
          onClick={zoomOut}
          id="btn-zoom-out"
          title="Zoom out"
        >
          −
        </button>
        <button
          className={`toolbar-action-btn zoom-reset ${zoom !== 1 ? "active" : ""}`}
          onClick={zoomReset}
          id="btn-zoom-reset"
          title="Reset zoom"
        >
          ⊙
        </button>
        <button
          className="toolbar-action-btn"
          onClick={zoomIn}
          id="btn-zoom-in"
          title="Zoom in"
        >
          +
        </button>

        <div className="toolbar-divider" />

        {/* Keyboard toggle */}
        <button
          className={`toolbar-action-btn kb-toggle ${showKeyboard ? "active" : ""}`}
          onClick={toggleKeyboard}
          id="btn-screen-kb"
          title="Quick keyboard"
        >
          ⌨️
        </button>

        {/* PiP toggle */}
        <button
          className={`toolbar-action-btn pip-toggle ${pip ? "active" : ""}`}
          onClick={() => setPip((v) => !v)}
          id="btn-pip"
          title="Picture-in-Picture"
        >
          ⧉
        </button>
      </div>
    </div>
  );
}
