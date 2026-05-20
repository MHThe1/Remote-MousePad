import { useState, useEffect, useRef, useCallback } from "react";
import { ws } from "../ws";
import {
  Monitor, Disc, ChevronUp, ChevronDown,
  RotateCcw, Keyboard as KeyboardIcon, PictureInPicture,
  MousePointerClick, Minus, Plus
} from "lucide-react";
import {
  hapticTap, hapticRightClick, hapticDouble, hapticModeChange,
  hapticScroll
} from "../haptics";

/* ── Types ──────────────────────────────────────────────────── */
interface PCDimensions { width: number; height: number; }
interface MonitorInfo {
  index: number; name: string;
  width: number; height: number; is_primary: boolean;
}

type ClickMode = "left" | "right" | "double";

/* ── Helpers ─────────────────────────────────────────────────── */
function dist(a: React.Touch, b: React.Touch) {
  const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function mid(a: React.Touch, b: React.Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

/* Natural size of the image once loaded */
let naturalW = 0, naturalH = 0;

/* ════════════════════════════════════════════════════════════ */
export default function ScreenPanel() {
  const [frameSrc, setFrameSrc]         = useState<string>("");
  const [pcDim, setPcDim]               = useState<PCDimensions>({ width: 1920, height: 1080 });
  const [clickMode, setClickMode]       = useState<ClickMode>("left");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput]       = useState("");
  const [monitors, setMonitors]         = useState<MonitorInfo[]>([]);
  const [activeMonitor, setActiveMonitor] = useState(0);
  const [pip, setPip]                   = useState(false);
  const [pipPos, setPipPos]             = useState({ x: 16, y: 16 });
  const [zoom, setZoom]                 = useState(1); // React state for zoom (for slider + badge)

  /* ── Refs for zero-re-render pan/zoom ────────────────────── */
  // z = current user zoom (1 = fit-to-screen); baseScale = containerW/naturalW
  const transformRef     = useRef({ z: 1, x: 0, y: 0, baseScale: 1 });
  const transformableRef = useRef<HTMLDivElement>(null);
  const badgeRef         = useRef<HTMLDivElement>(null);
  const cursorRef        = useRef<HTMLDivElement>(null);
  const zoomSliderRef    = useRef<HTMLInputElement>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const imageRef   = useRef<HTMLImageElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  /* ── Apply transform: image is at naturalW×naturalH, baseScale fits it ──
     Total rendered scale = baseScale * z
     pan offsets (x,y) are in screen-pixels relative to wrapper top-left    */
  const applyDOM = useCallback((newZ?: number) => {
    const t = transformRef.current;
    const totalScale = t.baseScale * t.z;
    if (transformableRef.current) {
      // transform-origin is 0 0 (top-left of the natural-size image container)
      transformableRef.current.style.transform =
        `translate(${t.x}px, ${t.y}px) scale(${totalScale})`;
    }
    if (badgeRef.current) {
      badgeRef.current.textContent = `${t.z.toFixed(1)}×`;
      badgeRef.current.style.opacity = t.z > 1.05 ? "1" : "0";
    }
    if (zoomSliderRef.current) {
      zoomSliderRef.current.value = String(t.z);
    }
    if (newZ !== undefined) setZoom(newZ);
  }, []);

  /* ── Recalculate baseScale when wrapper or image size changes ── */
  const recalcBase = useCallback(() => {
    const w = wrapperRef.current;
    const img = imageRef.current;
    if (!w || !img || naturalW === 0) return;
    // Fit image inside wrapper while preserving aspect ratio
    const scaleW = w.clientWidth  / naturalW;
    const scaleH = w.clientHeight / naturalH;
    const base   = Math.min(scaleW, scaleH);
    transformRef.current.baseScale = base;
    // Center the image at zoom=1
    const imgDisplayW = naturalW * base;
    const imgDisplayH = naturalH * base;
    transformRef.current.x = (w.clientWidth  - imgDisplayW) / 2;
    transformRef.current.y = (w.clientHeight - imgDisplayH) / 2;
    applyDOM();
  }, [applyDOM]);

  /* ── Clamp pan so image stays within wrapper ─────────────── */
  const clamp = useCallback((x: number, y: number, z: number) => {
    const w = wrapperRef.current;
    if (!w) return { x, y };
    const t        = transformRef.current;
    const dispW    = naturalW * t.baseScale * z;  // total rendered width
    const dispH    = naturalH * t.baseScale * z;
    const minX     = Math.min(0, w.clientWidth  - dispW);
    const minY     = Math.min(0, w.clientHeight - dispH);
    const maxX     = Math.max(0, w.clientWidth  - dispW);
    const maxY     = Math.max(0, w.clientHeight - dispH);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  /* ── Coordinate mapping: client px → PC absolute px ─────── */
  const clientToPC = useCallback((cx: number, cy: number) => {
    const w = wrapperRef.current;
    if (!w || naturalW === 0) return null;
    const rect        = w.getBoundingClientRect();
    const t           = transformRef.current;
    const totalScale  = t.baseScale * t.z;
    // Convert screen coords to image natural pixel coords
    const imgNatX = (cx - rect.left - t.x) / totalScale;
    const imgNatY = (cy - rect.top  - t.y) / totalScale;
    const fx = imgNatX / naturalW;
    const fy = imgNatY / naturalH;
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
    const lx = Math.max(0, Math.min(rect.width,  cx - rect.left));
    const ly = Math.max(0, Math.min(rect.height, cy - rect.top));
    cur.style.left    = `${lx}px`;
    cur.style.top     = `${ly}px`;
    cur.style.display = "block";
  }, []);

  const hideCursor = useCallback(() => {
    if (cursorRef.current) cursorRef.current.style.display = "none";
  }, []);

  /* ── ResizeObserver to keep baseScale fresh ─────────────── */
  useEffect(() => {
    const w = wrapperRef.current;
    if (!w) return;
    const ro = new ResizeObserver(() => recalcBase());
    ro.observe(w);
    return () => ro.disconnect();
  }, [recalcBase]);

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
    const base = transformRef.current.baseScale;
    transformRef.current = { z: 1, x: 0, y: 0, baseScale: base };
    recalcBase();
    setZoom(1);
    ws.send({ type: "stop_screen_stream" });
    ws.send({ type: "start_screen_stream", monitor_index: idx });
  };

  /* ── Click mode — separate from the trigger buttons ─────── */
  const selectMode = useCallback((mode: ClickMode) => {
    hapticModeChange();
    setClickMode(mode);
  }, []);

  /* ── Click dispatch using current click mode ─────────────── */
  const doClick = useCallback((cx: number, cy: number) => {
    const pc = clientToPC(cx, cy);
    if (!pc) return;
    ws.send({ type: "mouse_move_abs", x: pc.x, y: pc.y });
    if (clickMode === "left") {
      hapticTap();
      ws.send({ type: "mouse_click", button: "left" });
    } else if (clickMode === "right") {
      hapticRightClick();
      ws.send({ type: "mouse_click", button: "right" });
    } else {
      hapticDouble();
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
      const newDist = dist(e.touches[0], e.touches[1]);
      const newMid  = mid(e.touches[0], e.touches[1]);
      const w       = wrapperRef.current;

      if (w && s.pinchDist > 0) {
        const ratio  = newDist / s.pinchDist;
        const prevZ  = t.z;
        // ZOOM_MIN=1 means "fit to screen"; user can pinch out beyond that
        const nextZ  = Math.max(1, Math.min(ZOOM_MAX, prevZ * ratio));

        const rect   = w.getBoundingClientRect();
        const focalX = newMid.x - rect.left;
        const focalY = newMid.y - rect.top;

        // Pan offset adjustment to keep focal point fixed under fingers:
        // new_offset = old_offset + focal × (totalScale_old⁻¹ − totalScale_new⁻¹) × totalScale²
        // Simplified: shift = focal * (1/prevZ - 1/nextZ) expressed in screen space
        const prevTotal = t.baseScale * prevZ;
        const nextTotal = t.baseScale * nextZ;
        let nx = t.x + focalX * (1 - nextTotal / prevTotal) + (newMid.x - s.pinchMid.x);
        let ny = t.y + focalY * (1 - nextTotal / prevTotal) + (newMid.y - s.pinchMid.y);

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
        // Panning while zoomed in
        const c = clamp(t.x + dx, t.y + dy, t.z);
        t.x = c.x; t.y = c.y;
        applyDOM();
        hideCursor();
      } else {
        // Moving PC mouse
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

  /* ── Shared zoom-toward-center helper ───────────────────── */
  const applyZoom = useCallback((nextZ: number) => {
    const t     = transformRef.current;
    const prevZ = t.z;
    nextZ       = Math.max(1, Math.min(ZOOM_MAX, nextZ));
    if (Math.abs(nextZ - prevZ) < 0.001) return;
    const w = wrapperRef.current;
    if (w) {
      const cx = w.clientWidth  / 2;
      const cy = w.clientHeight / 2;
      const prevTotal = t.baseScale * prevZ;
      const nextTotal = t.baseScale * nextZ;
      let nx = t.x + cx * (1 - nextTotal / prevTotal);
      let ny = t.y + cy * (1 - nextTotal / prevTotal);
      if (nextZ <= 1) { recalcBase(); return; } // reset to centered fit
      const c = clamp(nx, ny, nextZ);
      t.z = nextZ; t.x = c.x; t.y = c.y;
    } else {
      t.z = nextZ;
    }
    applyDOM(nextZ);
  }, [clamp, applyDOM, recalcBase]);

  /* ── Zoom step buttons ───────────────────────────────────── */
  const zoomStep = useCallback((delta: number) => {
    applyZoom(transformRef.current.z + delta);
  }, [applyZoom]);

  /* ── Zoom slider ─────────────────────────────────────────── */
  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    applyZoom(parseFloat(e.target.value));
  }, [applyZoom]);

  const zoomReset = useCallback(() => {
    transformRef.current.z = 1;
    recalcBase();   // re-centers and resets pan
    setZoom(1);
  }, [recalcBase]);

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
          style={{ transformOrigin: "0 0" }}
        >
          {/* Image rendered at NATURAL size — so CSS scale reveals real pixels */}
          <img
            ref={imageRef}
            src={frameSrc}
            alt="PC Desktop View"
            className="screen-img-display"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              naturalW = img.naturalWidth  || img.width  || 1920;
              naturalH = img.naturalHeight || img.height || 1080;
              recalcBase();
            }}
          />
        </div>
      ) : (
        <div className="screen-placeholder">
          <Monitor size={48} strokeWidth={1.5} className="screen-loader-icon" />
          <span className="screen-loading-text">Connecting to Live Feed…</span>
        </div>
      )}

      {/* Zoom badge */}
      <div ref={badgeRef} className="zoom-badge" style={{ opacity: 0 }} />

      {/* Cursor overlay */}
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

      {/* ── Click Mode Selector ── */}
      <div className="click-mode-selector">
        <button
          id="screen-mode-left"
          className={`click-mode-btn ${clickMode === "left" ? "active" : ""}`}
          onClick={() => selectMode("left")}
          title="Left click mode"
        >
          <MousePointerClick size={15} />
          <span>Left</span>
        </button>
        <button
          id="screen-mode-double"
          className={`click-mode-btn ${clickMode === "double" ? "active double" : ""}`}
          onClick={() => selectMode("double")}
          title="Double click mode"
        >
          <span className="double-click-icon">2×</span>
          <span>Double</span>
        </button>
        <button
          id="screen-mode-right"
          className={`click-mode-btn ${clickMode === "right" ? "active right" : ""}`}
          onClick={() => selectMode("right")}
          title="Right click mode"
        >
          <MousePointerClick size={15} style={{ transform: "scaleX(-1)" }} />
          <span>Right</span>
        </button>
      </div>

      {/* ── Trigger Buttons (send actual mouse down/up) ── */}
      <div className="trigger-buttons">
        <button
          id="screen-btn-left-trigger"
          className={`trigger-btn trigger-left ${clickMode === "left" ? "mode-active" : ""}`}
          onTouchStart={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "left" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseDown={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "left" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "left" })}
        >
          <MousePointerClick size={18} />
          <span>Left</span>
        </button>

        <div className="trigger-middle-group">
          <button
            id="screen-btn-middle-trigger"
            className="trigger-btn trigger-middle"
            onTouchStart={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "middle" }); }}
            onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
            onMouseDown={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "middle" }); }}
            onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
            onMouseLeave={() => ws.send({ type: "mouse_up", button: "middle" })}
          >
            <Disc size={16} />
          </button>
          <div className="trigger-scroll-btns">
            <button id="screen-btn-scroll-up" className="scroll-mini-btn"
              onTouchStart={(e) => { e.preventDefault(); hapticScroll(); ws.send({ type: "scroll", dx: 0, dy: 3 }); }}>
              <ChevronUp size={14} />
            </button>
            <button id="screen-btn-scroll-down" className="scroll-mini-btn"
              onTouchStart={(e) => { e.preventDefault(); hapticScroll(); ws.send({ type: "scroll", dx: 0, dy: -3 }); }}>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>

        <button
          id="screen-btn-right-trigger"
          className={`trigger-btn trigger-right ${clickMode === "right" ? "mode-active" : ""}`}
          onTouchStart={(e) => { e.preventDefault(); hapticRightClick(); ws.send({ type: "mouse_down", button: "right" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseDown={(e) => { e.preventDefault(); hapticRightClick(); ws.send({ type: "mouse_down", button: "right" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "right" })}
        >
          <MousePointerClick size={18} style={{ transform: "scaleX(-1)" }} />
          <span>Right</span>
        </button>
      </div>

      {/* ── Zoom Toolbar ── */}
      <div className="screen-zoom-toolbar">
        <button className="zoom-step-btn" onClick={() => zoomStep(-0.25)} id="btn-zoom-out" title="Zoom out">
          <Minus size={16} />
        </button>

        <div className="zoom-slider-wrap">
          <input
            ref={zoomSliderRef}
            type="range"
            className="zoom-slider"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.05"
            defaultValue="1"
            onChange={handleZoomSlider}
            id="screen-zoom-slider"
          />
          <span className="zoom-slider-label">{zoom.toFixed(1)}×</span>
        </div>

        <button className="zoom-step-btn" onClick={() => zoomStep(0.25)} id="btn-zoom-in" title="Zoom in">
          <Plus size={16} />
        </button>

        <div className="zoom-toolbar-divider" />

        <button
          className={`zoom-toolbar-btn ${zoom > 1.05 ? "active" : ""}`}
          onClick={zoomReset}
          id="btn-zoom-reset"
          title="Reset zoom"
        >
          <RotateCcw size={15} />
        </button>

        <button
          className={`zoom-toolbar-btn ${showKeyboard ? "active" : ""}`}
          onClick={toggleKeyboard}
          id="btn-screen-kb"
          title="Quick keyboard"
        >
          <KeyboardIcon size={16} />
        </button>

        <button
          className={`zoom-toolbar-btn ${pip ? "active" : ""}`}
          onClick={() => setPip(v => !v)}
          id="btn-pip"
          title="Picture-in-Picture"
        >
          <PictureInPicture size={16} />
        </button>
      </div>
    </div>
  );
}
