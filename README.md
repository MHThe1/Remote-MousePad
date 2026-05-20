# MouseRemote 🖱️

A self-hosted, open-source alternative to Remote Mouse. Control your PC wirelessly from your phone — no subscriptions, no limitations.

## Features

- 🖱️ **Touchpad** — Drag to move cursor, tap to click, two-finger scroll
- ⌨️ **Keyboard** — Text input, shortcuts (Ctrl+C/V/Z...), special keys
- 🎵 **Media Control** — Play/Pause, Next/Prev track, Volume, Mute
- ⚡ **Power Panel** — Sleep, Lock, Restart, Shutdown (with confirmation)
- 🪟 **App Switcher** — List + focus any open window on your PC

## Architecture

```
PC (Tauri Desktop App)              Phone (Browser)
├── WebSocket Server :9001   ◄────  WebSocket Client
├── HTTP Server :9000        ────►  Mobile PWA (React)
└── enigo (input simulation)
```

The phone opens `http://<PC-IP>:9000` in any browser — no app install needed.

## Getting Started

### Prerequisites
- [Rust](https://rustup.rs/) (1.75+)
- [Node.js](https://nodejs.org/) (18+)
- Windows 10/11

### Development

```bash
# Install dependencies
npm install

# Build the mobile PWA
cd mobile && npm install && npm run build && cd ..

# Run the Tauri desktop app (dev mode)
npm run tauri dev
```

### Usage

1. Launch the **MouseRemote** desktop app on your PC
2. Scan the QR code shown in the app, or open `http://<LAN-IP>:9000` on your phone
3. Connect — the phone UI loads instantly in your browser
4. Use the tabs to switch between Mouse, Keyboard, Media, Power, and Apps

## Project Structure

```
MouseRemote/
├── src/                    # Desktop Tauri UI (React)
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # Tauri app entry
│       ├── ws_server.rs    # WebSocket server (port 9001)
│       ├── http_server.rs  # HTTP server for mobile PWA (port 9000)
│       ├── input_handler.rs # Mouse/keyboard/media/power via enigo
│       └── window_manager.rs # Windows EnumWindows API
└── mobile/                 # Mobile PWA (React + Vite)
    └── src/
        ├── ws.ts           # WebSocket client singleton
        └── panels/         # All control panels
```

## License

MIT — do whatever you want with it.
