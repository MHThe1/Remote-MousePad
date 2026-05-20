import { useState, useRef, useCallback, useEffect } from "react";
import { ws } from "../ws";
import { Keyboard, Hand, MousePointerClick, ChevronUp, ChevronDown, Disc } from "lucide-react";
import { hapticTap, hapticRightClick, hapticDouble, hapticScroll } from "../haptics";
export default function TouchpadPanel() {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef(0);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isTwoFinger = useRef(false);
  const lastTwoFingerY = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (showKeyboard && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showKeyboard]);

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

  const toggleKeyboard = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowKeyboard((prev) => !prev);
  };

  const SENSITIVITY = 1.8;
  const SCROLL_SENSITIVITY = 0.4;
  const TAP_MAX_MOVE = 8;
  const TAP_MAX_TIME = 200;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    touchStartTime.current = Date.now();

    if (e.targetTouches.length === 1) {
      const t = e.targetTouches[0];
      lastTouch.current = { x: t.clientX, y: t.clientY };
      touchStartPos.current = { x: t.clientX, y: t.clientY };
      isTwoFinger.current = false;
      lastTwoFingerY.current = null;
    } else if (e.targetTouches.length === 2) {
      isTwoFinger.current = true;
      isDragging.current = false;
      const avgY = (e.targetTouches[0].clientY + e.targetTouches[1].clientY) / 2;
      lastTwoFingerY.current = avgY;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.targetTouches.length === 2 && isTwoFinger.current) {
      // Two-finger scroll
      const avgY = (e.targetTouches[0].clientY + e.targetTouches[1].clientY) / 2;
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

    if (e.targetTouches.length === 1 && !isTwoFinger.current) {
      const t = e.targetTouches[0];
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
        hapticTap();
        ws.send({ type: "mouse_click", button: "left" });
      }
    }

    lastTouch.current = null;
    touchStartPos.current = null;
  }, []);

  return (
    <div className="touchpad-panel">
      <div className="touchpad-wrapper">
        {/* Floating Keyboard Toggle */}
        <button
          id="btn-touchpad-kb-toggle"
          className={`touchpad-kb-toggle ${showKeyboard ? "active" : ""}`}
          onTouchStart={toggleKeyboard}
          onClick={toggleKeyboard}
          aria-label="Toggle Virtual Keyboard"
        >
          <Keyboard size={20} />
        </button>

        {/* Sleek inline Quick Type bar */}
        {showKeyboard && (
          <div className="touchpad-keyboard-row">
            <input
              ref={inputRef}
              type="text"
              className="touchpad-keyboard-input"
              placeholder="Quick type here..."
              value={textInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
            />
            <button
              className="touchpad-keyboard-clear"
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); handleClear(); }}
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
            >
              ✕
            </button>
          </div>
        )}

        <div
          className="touchpad"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="touchpad-hint">
            <span className="touchpad-icon"><Hand size={32} strokeWidth={1.5} /></span>
            <p>Drag to move cursor</p>
            <p className="sub">Tap = left click · 2 fingers = scroll</p>
          </div>
        </div>
      </div>

      <div className="mouse-buttons">
        <button
          id="btn-left-click"
          className="mouse-btn"
          onTouchStart={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "left" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseDown={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "left" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "left" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "left" })}
        >
          <MousePointerClick size={16} />
          Left
        </button>
        <button
          id="btn-middle-click"
          className="mouse-btn mouse-btn-middle"
          onTouchStart={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "middle" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
          onMouseDown={(e) => { e.preventDefault(); hapticTap(); ws.send({ type: "mouse_down", button: "middle" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "middle" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "middle" })}
        >
          <Disc size={16} />
        </button>
        <button
          id="btn-right-click"
          className="mouse-btn"
          onTouchStart={(e) => { e.preventDefault(); hapticRightClick(); ws.send({ type: "mouse_down", button: "right" }); }}
          onTouchEnd={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseDown={(e) => { e.preventDefault(); hapticRightClick(); ws.send({ type: "mouse_down", button: "right" }); }}
          onMouseUp={(e) => { e.preventDefault(); ws.send({ type: "mouse_up", button: "right" }); }}
          onMouseLeave={() => ws.send({ type: "mouse_up", button: "right" })}
        >
          Right
          <MousePointerClick size={16} style={{ transform: "scaleX(-1)" }} />
        </button>
      </div>

      <div className="scroll-controls">
        <button
          id="btn-scroll-up"
          className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); hapticScroll(); ws.send({ type: "scroll", dx: 0, dy: 3 }); }}
        >
          <ChevronUp size={16} /> Scroll Up
        </button>
        <button
          id="btn-scroll-down"
          className="scroll-btn"
          onTouchStart={(e) => { e.preventDefault(); hapticScroll(); ws.send({ type: "scroll", dx: 0, dy: -3 }); }}
        >
          <ChevronDown size={16} /> Scroll Down
        </button>
      </div>
    </div>
  );
}
