import { useState } from "react";
import { ws } from "../ws";
import { Lock, Moon, RotateCw, Power } from "lucide-react";
import { hapticPower, hapticWarning, hapticDanger } from "../haptics";

interface PowerAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  action: string;
  danger?: boolean;
}

const POWER_ACTIONS: PowerAction[] = [
  {
    id: "btn-lock",
    icon: <Lock size={32} />,
    label: "Lock Screen",
    description: "Lock the PC screen",
    action: "lock",
  },
  {
    id: "btn-sleep",
    icon: <Moon size={32} />,
    label: "Sleep",
    description: "Put the PC to sleep",
    action: "sleep",
  },
  {
    id: "btn-restart",
    icon: <RotateCw size={32} />,
    label: "Restart",
    description: "Restart in 5 seconds",
    action: "restart",
    danger: true,
  },
  {
    id: "btn-shutdown",
    icon: <Power size={32} />,
    label: "Shut Down",
    description: "Shut down in 5 seconds",
    action: "shutdown",
    danger: true,
  },
];

export default function PowerPanel() {
  const [confirm, setConfirm] = useState<PowerAction | null>(null);

  const handleTap = (action: PowerAction) => {
    if (action.danger) {
      hapticWarning();
      setConfirm(action);
    } else {
      hapticPower();
      ws.send({ type: "power", action: action.action });
    }
  };

  const confirmAction = () => {
    if (confirm) {
      hapticDanger();
      ws.send({ type: "power", action: confirm.action });
      setConfirm(null);
    }
  };

  return (
    <div className="power-panel">
      <div className="power-grid">
        {POWER_ACTIONS.map((a) => (
          <button
            key={a.id}
            id={a.id}
            className={`power-btn ${a.danger ? "danger" : ""}`}
            onClick={() => handleTap(a)}
          >
            <span className="power-icon">{a.icon}</span>
            <span className="power-label">{a.label}</span>
            <span className="power-desc">{a.description}</span>
          </button>
        ))}
      </div>

      {/* Confirm Dialog */}
      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">{confirm.icon}</div>
            <h3 className="confirm-title">{confirm.label}?</h3>
            <p className="confirm-desc">{confirm.description}. Are you sure?</p>
            <div className="confirm-actions">
              <button
                id="btn-confirm-cancel"
                className="confirm-btn cancel"
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-ok"
                className="confirm-btn danger"
                onClick={confirmAction}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
