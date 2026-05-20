import { useState } from "react";
import { ws } from "../ws";
import { Music, SkipBack, Play, SkipForward, Volume1, VolumeX, Volume2 } from "lucide-react";

interface MediaButtonProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  action: string;
  large?: boolean;
  className?: string;
}

function MediaButton({ id, icon, label, action, large, className }: MediaButtonProps) {
  const [pressed, setPressed] = useState(false);

  const trigger = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setPressed(true);
    ws.send({ type: "media", action });
    setTimeout(() => setPressed(false), 150);
  };

  return (
    <button
      id={id}
      className={`media-btn ${large ? "media-btn-large" : ""} ${pressed ? "pressed" : ""} ${className ?? ""}`}
      onTouchStart={trigger}
      onClick={trigger}
    >
      <span className="media-icon">{icon}</span>
      <span className="media-label">{label}</span>
    </button>
  );
}

export default function MediaPanel() {
  return (
    <div className="media-panel">
      <div className="media-card">
        <div className="media-now-playing">
          <div className="now-playing-art"><Music size={28} /></div>
          <div className="now-playing-text">
            <div className="now-playing-title">Media Control</div>
            <div className="now-playing-subtitle">Control any media on your PC</div>
          </div>
        </div>

        {/* Main Controls */}
        <div className="media-main-controls">
          <MediaButton
            id="btn-media-prev"
            icon={<SkipBack size={24} />}
            label="Prev"
            action="prev"
          />
          <MediaButton
            id="btn-media-play"
            icon={<Play size={32} />}
            label="Play / Pause"
            action="play_pause"
            large
            className="play-btn"
          />
          <MediaButton
            id="btn-media-next"
            icon={<SkipForward size={24} />}
            label="Next"
            action="next"
          />
        </div>

        {/* Volume Controls */}
        <div className="volume-row">
          <MediaButton
            id="btn-vol-down"
            icon={<Volume1 size={20} />}
            label="Vol −"
            action="vol_down"
          />
          <MediaButton
            id="btn-mute"
            icon={<VolumeX size={20} />}
            label="Mute"
            action="mute"
          />
          <MediaButton
            id="btn-vol-up"
            icon={<Volume2 size={20} />}
            label="Vol +"
            action="vol_up"
          />
        </div>
      </div>

      <div className="media-hint">
        Controls system volume and media playback across all apps
      </div>
    </div>
  );
}
