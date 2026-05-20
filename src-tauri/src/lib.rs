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

fn get_lan_ip() -> String {
    // 1. Try local_ip() first (most accurate if internet/default gateway is connected)
    if let Ok(ip) = local_ip() {
        let ip_str = ip.to_string();
        if ip_str != "127.0.0.1" {
            return ip_str;
        }
    }

    // 2. If it fails or returns loopback, iterate through all interfaces
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        let mut candidates = Vec::new();
        for (name, ip) in interfaces {
            if ip.is_ipv4() {
                let ip_str = ip.to_string();
                if ip_str.starts_with("127.") {
                    continue;
                }
                let lower_name = name.to_lowercase();
                let is_virtual = lower_name.contains("virtual")
                    || lower_name.contains("wsl")
                    || lower_name.contains("vbox")
                    || lower_name.contains("docker")
                    || lower_name.contains("vethernet")
                    || lower_name.contains("loopback");

                candidates.push((is_virtual, ip_str));
            }
        }

        // Sort so that non-virtual interfaces are preferred
        candidates.sort_by_key(|(is_virtual, _)| *is_virtual);

        if let Some((_, ip_str)) = candidates.first() {
            return ip_str.clone();
        }
    }

    "127.0.0.1".to_string()
}

#[tauri::command]
fn get_server_info(clients: tauri::State<ConnectedClients>) -> ServerInfo {
    let lan_ip = get_lan_ip();
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
