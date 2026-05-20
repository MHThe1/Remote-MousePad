import { useRef, useCallback } from "react";
import { ws } from "../ws";


export default function TouchpadPanel() {
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef(0);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isTwoFinger = useRef(false);
  const lastTwoFingerY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const SENSITIVITY = 1.8;
  const SCROLL_SENSITIVITY = 0.4;
  const TAP_MAX_MOVE = 8;
  const TAP_MAX_TIME = 200;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    touchStartTime.current = Date.now();

    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouch.current = { x: t.clientX, y: t.clientY };
      touchStartPos.current = { x: t.clientX, y: t.clientY };
      isTwoFinger.current = false;
      lastTwoFingerY.current = null;
    } else if (e.touches.length === 2) {
      isTwoFinger.current = true;
      isDragging.current = false;
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      lastTwoFingerY.current = avgY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2 && isTwoFinger.current) {
      // Two-finger scroll
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (lastTwoFingerY.current !== null) {
        const dy = (avgY - lastTwoFingerY.current) * SCROLL_SENSITIVITY;
        const scrollAmount = Math.round(dy);
        if (scrollAmount !== 0) {
          ws.send({ type: "scroll", dx: 0, dy: -scrollAmount });
        }
      }
      lastTwoFingerY.current = avgY;
      return;
    }

    if (e.touches.length === 1 && !isTwoFinger.current) {
      const t = e.touches[0];
      if (lastTouch.current) {
        const dx = Math.round((t.clientX - lastTouch.current.x) * SENSITIVITY);
        const dy = Math.round((t.clientY - lastTouch.current.y) * SENSITIVITY);
        if (dx !== 0 || dy !== 0) {
          ws.send({ type: "mouse_move", dx, dy });
        }
      }
      lastTouch.current = { x: t.clientX, y: t.clientY };
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (isTwoFinger.current) {
      isTwoFinger.current = false;
      lastTwoFingerY.current = null;
      return;
    }

    const elapsed = Date.now() - touchStartTime.current;
    if (touchStartPos.current && lastTouch.current && elapsed < TAP_MAX_TIME) {
      const dx = Math.abs(lastTouch.current.x - touchStartPos.current.x);
      const dy = Math.abs(lastTouch.current.y - touchStartPos.current.y);
      if (dx < TAP_MAX_MOVE && dy < TAP_MAX_MOVE) {
        ws.send({ type: "mouse_click", button: "left" });
      }
    }

    lastTouch.current = null;
    touchStartPos.current = null;
  }, []);

  return (
    <div className="touchpad-panel">
      <div
        className="touchpad"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="touchpad-hint">
          <span className="touchpad-icon">☝️</span>
          <p>Drag to move cursor</p>
          <p className="sub">Tap = left click · 2 fingers = scroll</p>
        </div>
      </div>

      <div className="mouse-buttons">
        <button
          id="btn-left-click"
          className="mouse-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_click", button: "left" }); }}
        >
          <span>◀</span>
          Left
        </button>
        <button
          id="btn-middle-click"
          className="mouse-btn mouse-btn-middle"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_click", button: "middle" }); }}
        >
          ●
        </button>
        <button
          id="btn-right-click"
          className="mouse-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "mouse_click", button: "right" }); }}
        >
          <span>▶</span>
          Right
        </button>
      </div>

      <div className="scroll-controls">
        <button
          id="btn-scroll-up"
          className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "scroll", dx: 0, dy: 3 }); }}
        >
          ▲ Scroll Up
        </button>
        <button
          id="btn-scroll-down"
          className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); ws.send({ type: "scroll", dx: 0, dy: -3 }); }}
        >
          ▼ Scroll Down
        </button>
      </div>
    </div>
  );
}
