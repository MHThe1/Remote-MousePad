type MessageHandler = (msg: object) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private url: string = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private _connected = false;
  private onStatusChange: ((connected: boolean) => void) | null = null;

  connect(url: string) {
    this.url = url;
    this._connect();
  }

  private _connect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;
      this.onStatusChange?.(true);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handlers.forEach((h) => h(msg));
      } catch {}
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.onStatusChange?.(false);
      this.reconnectTimer = setTimeout(() => this._connect(), 2000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  send(msg: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get connected() {
    return this._connected;
  }

  addMessageHandler(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  setStatusChangeHandler(fn: (connected: boolean) => void) {
    this.onStatusChange = fn;
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this._connected = false;
  }
}

export const ws = new WSClient();
