mod http_server;
mod input_handler;
mod window_manager;
mod ws_server;

use local_ip_address::local_ip;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use ws_server::ConnectedClients;

const WS_PORT: u16 = 9001;
const HTTP_PORT: u16 = 9000;

#[derive(Clone, serde::Serialize)]
pub struct ServerInfo {
    pub lan_ip: String,
    pub ws_port: u16,
    pub http_port: u16,
    pub connected_clients: usize,
}

#[tauri::command]
fn get_server_info(clients: tauri::State<ConnectedClients>) -> ServerInfo {
    let lan_ip = local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let count = *clients.lock().unwrap();
    ServerInfo {
        lan_ip,
        ws_port: WS_PORT,
        http_port: HTTP_PORT,
        connected_clients: count,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let connected_clients: ConnectedClients = Arc::new(Mutex::new(0));
    let clients_for_ws = Arc::clone(&connected_clients);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(connected_clients)
        .setup(move |app| {
            // ── Start WebSocket server in background ───────────────────────
            let rt = tokio::runtime::Runtime::new().unwrap();
            let ws_clients = Arc::clone(&clients_for_ws);
            std::thread::spawn(move || {
                rt.block_on(async move {
                    if let Err(e) = ws_server::start_ws_server(WS_PORT, ws_clients).await {
                        eprintln!("[WS] Server error: {}", e);
                    }
                });
            });

            // ── Start HTTP server for mobile PWA ───────────────────────────
            let rt2 = tokio::runtime::Runtime::new().unwrap();
            std::thread::spawn(move || {
                rt2.block_on(async move {
                    if let Err(e) = http_server::start_http_server(HTTP_PORT).await {
                        eprintln!("[HTTP] Server error: {}", e);
                    }
                });
            });

            // ── System tray ────────────────────────────────────────────────
            let handle = app.handle().clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("MouseRemote — Running")
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_server_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
