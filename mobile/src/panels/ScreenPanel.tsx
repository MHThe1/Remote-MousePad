import { useState, useEffect, useRef, useCallback } from "react";
import { ws } from "../ws";
import {
  Monitor, MousePointerClick, Disc, ChevronUp, ChevronDown,
  ZoomIn, ZoomOut, RotateCcw, Keyboard as KeyboardIcon, PictureInPicture
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────── */
interface PCDimensions { width: number; height: number; }
interface MonitorInfo {
  index: number; name: string;
  width: number; height: number; is_primary: boolean;
}

/* ── Helpers ─────────────────────────────────────────────────── */
function dist(a: React.Touch, b: React.Touch) {
  const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function mid(a: React.Touch, b: React.Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

const ZOOM_MIN = 1, ZOOM_MAX = 10, ZOOM_STEP = 0.5;

/* ════════════════════════════════════════════════════════════ */
export default function ScreenPanel() {
  const [frameSrc, setFrameSrc]         = useState<string>("");
  const [pcDim, setPcDim]               = useState<PCDimensions>({ width: 1920, height: 1080 });
  const [clickMode, setClickMode]       = useState<"left" | "right" | "double">("left");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput]       = useState("");
  const [monitors, setMonitors]         = useState<MonitorInfo[]>([]);
  const [activeMonitor, setActiveMonitor] = useState(0);
  const [pip, setPip]                   = useState(false);
  const [pipPos, setPipPos]             = useState({ x: 16, y: 16 });

  /* ── Refs for zero-re-render pan/zoom ────────────────────── */
  const transformRef = useRef({ z: 1, x: 0, y: 0 });  // live transform state
  const transformableRef = useRef<HTMLDivElement>(null); // the scaled div
  const badgeRef         = useRef<HTMLDivElement>(null); // zoom badge
  const cursorRef        = useRef<HTMLDivElement>(null); // pointer overlay

  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageRef   = useRef<HTMLImageElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  /* ── Apply transform directly to DOM — no setState ──────── */
  const applyDOM = useCallback(() => {
    const t = transformRef.current;
    if (transformableRef.current) {
      transformableRef.current.style.transform =
        `translate(${t.x}px, ${t.y}px) scale(${t.z})`;
    }
    if (badgeRef.current) {
      badgeRef.current.textContent = `${t.z.toFixed(1)}×`;
      badgeRef.current.style.display = t.z > 1.05 ? "block" : "none";
    }
  }, []);

  /* ── Clamp pan so image stays within wrapper ─────────────── */
  const clamp = useCallback((x: number, y: number, z: number) => {
    const w = wrapperRef.current;
    if (!w) return { x, y };
    const maxX = w.clientWidth  * (z - 1);
    const maxY = w.clientHeight * (z - 1);
    return {
      x: Math.max(-maxX, Math.min(0, x)),
      y: Math.max(-maxY, Math.min(0, y)),
    };
  }, []);

  /* ── Coordinate mapping: client px → PC absolute px ─────── */
  const clientToPC = useCallback((cx: number, cy: number) => {
    const w = wrapperRef.current;
    if (!w) return null;
    const rect = w.getBoundingClientRect();
    const { z, x, y } = transformRef.current;
    const imgX = (cx - rect.left - x) / z;
    const imgY = (cy - rect.top  - y) / z;
    const fx   = imgX / rect.width;
    const fy   = imgY / rect.height;
    return {
      x: Math.round(Math.max(0, Math.min(1, fx)) * pcDim.width),
      y: Math.round(Math.max(0, Math.min(1, fy)) * pcDim.height),
    };
  }, [pcDim]);

  /* ── Update cursor overlay position ─────────────────────── */
  const moveCursor = useCallback((cx: number, cy: number) => {
    const cur = cursorRef.current;
    const w   = wrapperRef.current;
    if (!cur || !w) return;
    const rect = w.getBoundingClientRect();
    // Clamp to wrapper bounds
    const lx = Math.max(0, Math.min(rect.width,  cx - rect.left));
    const ly = Math.max(0, Math.min(rect.height, cy - rect.top));
    cur.style.left    = `${lx}px`;
    cur.style.top     = `${ly}px`;
    cur.style.display = "block";
  }, []);

  const hideCursor = useCallback(() => {
    if (cursorRef.current) cursorRef.current.style.display = "none";
  }, []);

  /* ── WebSocket ───────────────────────────────────────────── */
  useEffect(() => {
    ws.send({ type: "get_monitors" });
    ws.send({ type: "start_screen_stream", monitor_index: 0 });
    const remove = ws.addMessageHandler((msg: any) => {
      if      (msg.type === "monitors_list") setMonitors(msg.monitors || []);
      else if (msg.type === "screen_info")   setPcDim({ width: msg.width || 1920, height: msg.height || 1080 });
      else if (msg.type === "screen_frame")  setFrameSrc(msg.image || "");
    });
    return () => { ws.send({ type: "stop_screen_stream" }); remove(); };
  }, []);

  /* ── Monitor switching ───────────────────────────────────── */
  const switchMonitor = (idx: number) => {
    if (idx === activeMonitor) return;
    setActiveMonitor(idx);
    transformRef.current = { z: 1, x: 0, y: 0 };
    applyDOM();
    ws.send({ type: "stop_screen_stream" });
    ws.send({ type: "start_screen_stream", monitor_index: idx });
  };

  /* ── Click ───────────────────────────────────────────────── */
  const doClick = useCallback((cx: number, cy: number) => {
    const pc = clientToPC(cx, cy);
    if (!pc) return;
    ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });
    if      (clickMode === "left")   ws.send({ type: "mouse_click", button: "left" });
    else if (clickMode === "right")  ws.send({ type: "mouse_click", button: "right" });
    else {
      ws.send({ type: "mouse_click", button: "left" });
      setTimeout(() => ws.send({ type: "mouse_click", button: "left" }), 80);
    }
  }, [clickMode, clientToPC]);

  /* ── Touch state ─────────────────────────────────────────── */
  const ts = useRef({
    lastCount: 0,
    pinchDist: 0,
    pinchMid:  { x: 0, y: 0 },
    singlePos: { x: 0, y: 0 },
    dragged:   false,
    pipDragging: false,
    pipStart:    { tx: 0, ty: 0, px: 0, py: 0 },
  });

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = ts.current;
    s.lastCount = e.touches.length;

    if (e.touches.length === 2) {
      s.pinchDist = dist(e.touches[0], e.touches[1]);
      s.pinchMid  = mid(e.touches[0], e.touches[1]);
      s.dragged   = false;
      hideCursor();
    } else if (e.touches.length === 1) {
      s.singlePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      s.dragged   = false;
      moveCursor(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [moveCursor, hideCursor]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = ts.current;
    const t = transformRef.current;

    if (e.touches.length === 2) {
      /* ─── Focal-point pinch-to-zoom ────────────────────────
         Key formula: pan_new = pan_old + focal × (1/z_old − 1/z_new)
         This keeps the content under the pinch midpoint fixed.     */
      const newDist = dist(e.touches[0], e.touches[1]);
      const newMid  = mid(e.touches[0], e.touches[1]);
      const w       = wrapperRef.current;

      if (w && s.pinchDist > 0) {
        const ratio  = newDist / s.pinchDist;
        const prevZ  = t.z;
        const nextZ  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prevZ * ratio));

        const rect   = w.getBoundingClientRect();
        const focalX = newMid.x - rect.left;
        const focalY = newMid.y - rect.top;

        // Zoom toward focal point
        let nx = t.x + focalX * (1 / prevZ - 1 / nextZ);
        let ny = t.y + focalY * (1 / prevZ - 1 / nextZ);

        // Also pan with midpoint translation
        nx += newMid.x - s.pinchMid.x;
        ny += newMid.y - s.pinchMid.y;

        const c  = clamp(nx, ny, nextZ);
        t.z      = nextZ;
        t.x      = c.x;
        t.y      = c.y;
        applyDOM();
      }
      s.pinchDist = newDist;
      s.pinchMid  = newMid;
      s.dragged   = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx    = touch.clientX - s.singlePos.x;
      const dy    = touch.clientY - s.singlePos.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) s.dragged = true;

      if (t.z > 1.05) {
        // Pan
        const c = clamp(t.x + dx, t.y + dy, t.z);
        t.x = c.x; t.y = c.y;
        applyDOM();
        hideCursor();
      } else {
        // Move PC cursor
        const pc = clientToPC(touch.clientX, touch.clientY);
        if (pc) ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });
        moveCursor(touch.clientX, touch.clientY);
      }
      s.singlePos = { x: touch.clientX, y: touch.clientY };
    }
  }, [clamp, clientToPC, applyDOM, moveCursor, hideCursor]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const s = ts.current;
    if (!s.dragged && s.lastCount === 1 && e.changedTouches.length === 1) {
      doClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    s.dragged   = false;
    s.lastCount = e.touches.length;
    if (e.touches.length === 0) hideCursor();
  }, [doClick, hideCursor]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) doClick(e.clientX, e.clientY);
  }, [doClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    moveCursor(e.clientX, e.clientY);
    const pc = clientToPC(e.clientX, e.clientY);
    if (pc) ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });
  }, [moveCursor, clientToPC]);

  /* ── Zoom buttons (zoom toward center) ───────────────────── */
  const zoomStep = useCallback((delta: number) => {
    const t    = transformRef.current;
    const prevZ = t.z;
    const nextZ = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
      parseFloat((prevZ + delta).toFixed(1))));
    if (nextZ === prevZ) return;
    const w = wrapperRef.current;
    if (w) {
      const cx = w.clientWidth / 2, cy = w.clientHeight / 2;
      let nx = t.x + cx * (1 / prevZ - 1 / nextZ);
      let ny = t.y + cy * (1 / prevZ - 1 / nextZ);
      if (nextZ <= 1) { nx = 0; ny = 0; }
      const c = clamp(nx, ny, nextZ);
      t.z = nextZ; t.x = c.x; t.y = c.y;
    } else {
      t.z = nextZ;
      if (nextZ <= 1) { t.x = 0; t.y = 0; }
    }
    applyDOM();
  }, [clamp, applyDOM]);

  const zoomReset = useCallback(() => {
    transformRef.current = { z: 1, x: 0, y: 0 };
    applyDOM();
  }, [applyDOM]);

  /* ── PiP drag ────────────────────────────────────────────── */
  const handlePipTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    ts.current.pipDragging = true;
    ts.current.pipStart    = { tx: e.touches[0].clientX, ty: e.touches[0].clientY, px: pipPos.x, py: pipPos.y };
  };
  const handlePipTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!ts.current.pipDragging) return;
    const { tx, ty, px, py } = ts.current.pipStart;
    setPipPos({ x: Math.max(8, px - (e.touches[0].clientX - tx)), y: Math.max(8, py + (e.touches[0].clientY - ty)) });
  };
  const handlePipTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation(); ts.current.pipDragging = false;
  };

  /* ── Keyboard ────────────────────────────────────────────── */
  const toggleKeyboard = () => {
    setShowKeyboard(v => !v);
    if (!showKeyboard) setTimeout(() => inputRef.current?.focus(), 150);
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nv = e.target.value;
    let cp = 0;
    while (cp < textInput.length && cp < nv.length && textInput[cp] === nv[cp]) cp++;
    for (let i = 0; i < textInput.length - cp; i++) ws.send({ type: "key_press", key: "backspace" });
    if (nv.slice(cp)) ws.send({ type: "text", text: nv.slice(cp) });
    setTextInput(nv);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && textInput === "") ws.send({ type: "key_press", key: "backspace" });
    else if (e.key === "Enter") { ws.send({ type: "key_press", key: "enter" }); setTextInput(""); }
  };

  /* ── Stream content ──────────────────────────────────────── */
  const streamContent = (
    <div
      className="screen-zoom-wrapper"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={hideCursor}
    >
      {frameSrc ? (
        <div
          ref={transformableRef}
          className="screen-img-transformable"
          style={{ transform: "translate(0px,0px) scale(1)", transformOrigin: "0 0" }}
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
          <Monitor size={48} strokeWidth={1.5} className="screen-loader-icon" />
          <span className="screen-loading-text">Connecting to Live Feed…</span>
        </div>
      )}

      {/* Zoom badge — mutated directly by applyDOM */}
      <div ref={badgeRef} className="zoom-badge" style={{ display: "none" }} />

      {/* Cursor overlay — mutated directly by moveCursor/hideCursor */}
      <div ref={cursorRef} className="screen-cursor" style={{ display: "none" }} />
    </div>
  );

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="screen-stream-panel">
      {/* Monitor picker */}
      {monitors.length > 1 && (
        <div className="monitor-picker">
          {monitors.map((m) => (
            <button key={m.index} className={`monitor-chip ${activeMonitor === m.index ? "active" : ""}`}
              onClick={() => switchMonitor(m.index)} id={`monitor-chip-${m.index}`}>
              <Monitor size={14} />
              {m.name || `Display ${m.index + 1}`}
              {m.is_primary && <span className="monitor-primary-badge">●</span>}
            </button>
          ))}
        </div>
      )}

      {/* Quick Keyboard */}
      {showKeyboard && (
        <div className="screen-keyboard-row">
          <input ref={inputRef} className="screen-keyboard-input" type="text"
            placeholder="Quick type onto PC…" value={textInput}
            onChange={handleInputChange} onKeyDown={handleKeyDown} />
          <button className="screen-keyboard-clear" onClick={() => setTextInput("")}>✕</button>
        </div>
      )}

      {/* Screen canvas */}
      {!pip && <div className="screen-canvas-wrapper" ref={wrapperRef}>{streamContent}</div>}

      {/* PiP */}
      {pip && (
        <div className="pip-overlay" style={{ right: pipPos.x, top: pipPos.y }}>
          <div className="pip-drag-handle"
            onTouchStart={handlePipTouchStart}
            onTouchMove={handlePipTouchMove}
            onTouchEnd={handlePipTouchEnd}>
            <span className="pip-handle-dots">⋮⋮</span>
            <span className="pip-label">PiP</span>
            <button className="pip-expand-btn" onClick={() => setPip(false)} title="Expand">⛶</button>
          </div>
          {streamContent}
        </div>
      )}

      {/* ── Mouse Buttons ── */}
      <div className="mouse-buttons screen-mouse-buttons">
        <button id="screen-btn-left-click"
          className={`mouse-btn ${clickMode === "left" ? "active-click-mode" : ""}`}
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "left" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseDown={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "left" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "left" })}
          onClick={() => setClickMode("left")}>
          <MousePointerClick size={16} /> Left
        </button>
        <button id="screen-btn-middle-click" className="mouse-btn mouse-btn-middle"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "middle" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
          onMouseDown={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "middle" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "middle" })}>
          <Disc size={16} />
        </button>
        <button id="screen-btn-right-click"
          className={`mouse-btn ${clickMode === "right" ? "active-click-mode" : ""}`}
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "right" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseDown={(e) => { e.preventDefault(); ws.send({ type: "mouse_down", button: "right" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "right" })}
          onClick={() => setClickMode("right")}>
          Right <MousePointerClick size={16} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>

      {/* Scroll buttons */}
      <div className="scroll-controls">
        <button id="screen-btn-scroll-up" className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "scroll", dx: 0, dy: 3 }); }}>
          <ChevronUp size={16} /> Scroll Up
        </button>
        <button id="screen-btn-scroll-down" className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "scroll", dx: 0, dy: -3 }); }}>
          <ChevronDown size={16} /> Scroll Down
        </button>
      </div>

      {/* Floating Toolbar */}
      <div className="screen-floating-toolbar">
        <button className={`toolbar-action-btn ${clickMode === "double" ? "active" : ""}`}
          onClick={() => setClickMode("double")} id="btn-click-double" title="Double Click">2×</button>

        <div className="toolbar-divider" />

        <button className="toolbar-action-btn" onClick={() => zoomStep(-ZOOM_STEP)} id="btn-zoom-out" title="Zoom out">
          <ZoomOut size={18} />
        </button>
        <button className={`toolbar-action-btn zoom-reset ${transformRef.current.z !== 1 ? "active" : ""}`}
          onClick={zoomReset} id="btn-zoom-reset" title="Reset zoom">
          <RotateCcw size={16} />
        </button>
        <button className="toolbar-action-btn" onClick={() => zoomStep(ZOOM_STEP)} id="btn-zoom-in" title="Zoom in">
          <ZoomIn size={18} />
        </button>

        <div className="toolbar-divider" />

        <button className={`toolbar-action-btn kb-toggle ${showKeyboard ? "active" : ""}`}
          onClick={toggleKeyboard} id="btn-screen-kb" title="Quick keyboard">
          <KeyboardIcon size={18} />
        </button>
        <button className={`toolbar-action-btn pip-toggle ${pip ? "active" : ""}`}
          onClick={() => setPip(v => !v)} id="btn-pip" title="Picture-in-Picture">
          <PictureInPicture size={18} />
        </button>
      </div>
    </div>
  );
}
