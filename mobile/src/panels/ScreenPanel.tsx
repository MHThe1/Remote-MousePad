import { useState, useEffect, useRef } from "react";
import { ws } from "../ws";

interface PCDimensions {
  width: number;
  height: number;
}

export default function ScreenPanel() {
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [pcDimensions, setPcDimensions] = useState<PCDimensions>({ width: 1920, height: 1080 });
  const [clickMode, setClickMode] = useState<"left" | "right" | "double">("left");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState("");

  const imageRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1. Send start streaming command
    ws.send({ type: "start_screen_stream" });

    // 2. Add websocket message handler
    const removeHandler = ws.addMessageHandler((msg: any) => {
      if (msg.type === "screen_info") {
        setPcDimensions({
          width: msg.width || 1920,
          height: msg.height || 1080,
        });
      } else if (msg.type === "screen_frame") {
        setFrameSrc(msg.image || "");
      }
    });

    // 3. Cleanup: send stop stream on unmount
    return () => {
      ws.send({ type: "stop_screen_stream" });
      removeHandler();
    };
  }, []);

  const handleInteraction = (clientX: number, clientY: number) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    
    // Compute percentages
    const relativeX = (clientX - rect.left) / rect.width;
    const relativeY = (clientY - rect.top) / rect.height;

    // Convert to absolute PC pixels
    const absX = Math.round(relativeX * pcDimensions.width);
    const absY = Math.round(relativeY * pcDimensions.height);

    // Clamp coordinates to stay on screen
    const clampedX = Math.max(0, Math.min(pcDimensions.width, absX));
    const clampedY = Math.max(0, Math.min(pcDimensions.height, absY));

    // Send absolute mouse move
    ws.send({ type: "mouse_move_abs", x: clampedX, y: clampedY });

    // Trigger appropriate click
    if (clickMode === "left") {
      ws.send({ type: "mouse_click", button: "left" });
    } else if (clickMode === "right") {
      ws.send({ type: "mouse_click", button: "right" });
    } else if (clickMode === "double") {
      ws.send({ type: "mouse_click", button: "left" });
      setTimeout(() => {
        ws.send({ type: "mouse_click", button: "left" });
      }, 80);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleInteraction(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 1 && imageRef.current) {
      const touch = e.touches[0];
      const rect = imageRef.current.getBoundingClientRect();
      
      const relativeX = (touch.clientX - rect.left) / rect.width;
      const relativeY = (touch.clientY - rect.top) / rect.height;

      const absX = Math.round(relativeX * pcDimensions.width);
      const absY = Math.round(relativeY * pcDimensions.height);

      const clampedX = Math.max(0, Math.min(pcDimensions.width, absX));
      const clampedY = Math.max(0, Math.min(pcDimensions.height, absY));

      // Just move cursor on drag (allows tracking and hover)
      ws.send({ type: "mouse_move_abs", x: clampedX, y: clampedY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    // Only capture left click (button 0) for testing on desktop browser
    if (e.button === 0) {
      handleInteraction(e.clientX, e.clientY);
    }
  };

  const toggleKeyboard = () => {
    setShowKeyboard(!showKeyboard);
    if (!showKeyboard) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  };

  // Real-time quick typing diffing
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

    for (let i = 0; i < backspaces; i++) {
      ws.send({ type: "key_press", key: "backspace" });
    }

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

  return (
    <div className="screen-stream-panel">
      {/* Quick Keyboard input row */}
      {showKeyboard && (
        <div className="screen-keyboard-row">
          <input
            ref={inputRef}
            className="screen-keyboard-input"
            type="text"
            placeholder="Quick type onto PC..."
            value={textInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
          <button className="screen-keyboard-clear" onClick={() => setTextInput("")}>
            ✕
          </button>
        </div>
      )}

      {/* Screen Frame Display Canvas/Image */}
      <div className="screen-canvas-wrapper">
        {frameSrc ? (
          <img
            ref={imageRef}
            src={frameSrc}
            alt="PC Desktop View"
            className="screen-img-display"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onMouseDown={handleMouseDown}
          />
        ) : (
          <div className="screen-placeholder">
            <span className="screen-loader">📺</span>
            <span className="screen-loading-text">Connecting to Live Feed...</span>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="screen-floating-toolbar">
        <button
          className={`toolbar-action-btn ${clickMode === "left" ? "active" : ""}`}
          onClick={() => setClickMode("left")}
          title="Left Click Mode"
        >
          🖱️ Left
        </button>
        <button
          className={`toolbar-action-btn ${clickMode === "right" ? "active" : ""}`}
          onClick={() => setClickMode("right")}
          title="Right Click Mode"
        >
          🖱️ Right
        </button>
        <button
          className={`toolbar-action-btn ${clickMode === "double" ? "active" : ""}`}
          onClick={() => setClickMode("double")}
          title="Double Click Mode"
        >
          🖱️ Double
        </button>
        <div className="toolbar-divider"></div>
        <button
          className={`toolbar-action-btn kb-toggle ${showKeyboard ? "active" : ""}`}
          onClick={toggleKeyboard}
          title="Toggle Quick Keyboard"
        >
          ⌨️ {showKeyboard ? "Hide" : "Type"}
        </button>
      </div>
    </div>
  );
}
