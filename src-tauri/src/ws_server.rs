use crate::input_handler::{InputHandler, RemoteCommand};
use crate::window_manager::{focus_window, list_windows};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::{SinkExt, StreamExt};
use image::DynamicImage;
use serde_json::json;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message};

pub type ConnectedClients = Arc<Mutex<usize>>;

pub async fn start_ws_server(
    port: u16,
    clients: ConnectedClients,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    println!("[WS] Server listening on ws://0.0.0.0:{}", port);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                println!("[WS] New connection from {}", peer);
                let clients_clone = Arc::clone(&clients);
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, peer, clients_clone).await {
                        eprintln!("[WS] Connection error from {}: {}", peer, e);
                    }
                });
            }
            Err(e) => eprintln!("[WS] Accept error: {}", e),
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    clients: ConnectedClients,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let ws_stream = accept_async(stream).await?;
    let (mut write, mut read) = ws_stream.split();

    // Track connected count
    {
        let mut count = clients.lock().unwrap();
        *count += 1;
    }

    // Create a channel for writing to the socket
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Message>(100);
    let tx_clone = tx.clone();

    // Spawn a writer task
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Create an input handler per connection
    let handler = Arc::new(Mutex::new(InputHandler::new()?));

    // Streaming state
    let is_streaming = Arc::new(AtomicBool::new(false));
    // Selected monitor index (shared so we can update it mid-stream)
    let monitor_idx = Arc::new(AtomicUsize::new(0));

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                // ── start_screen_stream ───────────────────────────────────
                if text.contains("\"type\":\"start_screen_stream\"") {
                    // Parse optional monitor_index from the message
                    let req_idx: usize = serde_json::from_str::<serde_json::Value>(&text)
                        .ok()
                        .and_then(|v| v["monitor_index"].as_u64())
                        .unwrap_or(0) as usize;

                    // Always stop any previous stream first
                    is_streaming.store(false, Ordering::Relaxed);
                    // Small yield so the previous task can see the stop flag
                    tokio::time::sleep(std::time::Duration::from_millis(30)).await;

                    monitor_idx.store(req_idx, Ordering::Relaxed);
                    is_streaming.store(true, Ordering::Relaxed);

                    let is_streaming_clone = Arc::clone(&is_streaming);
                    let tx_clone2 = tx_clone.clone();
                    let idx = req_idx;
                    tokio::spawn(async move {
                        if let Err(e) = stream_screen(is_streaming_clone, tx_clone2, idx).await {
                            eprintln!("[WS] Screen capture stream error: {}", e);
                        }
                    });

                // ── stop_screen_stream ────────────────────────────────────
                } else if text.contains("\"type\":\"stop_screen_stream\"") {
                    is_streaming.store(false, Ordering::Relaxed);

                // ── All other commands ────────────────────────────────────
                } else {
                    let response = process_message(&text, &handler);
                    if let Some(resp) = response {
                        let _ = tx_clone.send(Message::Text(resp.into())).await;
                    }
                }
            }
            Ok(Message::Ping(data)) => {
                let _ = tx_clone.send(Message::Pong(data)).await;
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    // Ensure streaming is stopped upon client disconnect
    is_streaming.store(false, Ordering::Relaxed);

    println!("[WS] Disconnected: {}", peer);
    {
        let mut count = clients.lock().unwrap();
        *count = count.saturating_sub(1);
    }

    Ok(())
}

fn process_message(
    text: &str,
    handler: &Arc<Mutex<InputHandler>>,
) -> Option<String> {
    let cmd: RemoteCommand = match serde_json::from_str(text) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[WS] Invalid command: {} — {}", text, e);
            return None;
        }
    };

    match &cmd {
        // ── List all monitors ─────────────────────────────────────────────
        RemoteCommand::GetMonitors => {
            let monitors_info = tokio::task::block_in_place(|| {
                xcap::Monitor::all()
                    .unwrap_or_default()
                    .into_iter()
                    .enumerate()
                    .map(|(i, m)| {
                        json!({
                            "index": i,
                            "name": m.name().unwrap_or_else(|_| format!("Display {}", i + 1)),
                            "width": m.width().unwrap_or(1920),
                            "height": m.height().unwrap_or(1080),
                            "is_primary": m.is_primary().unwrap_or(i == 0),
                        })
                    })
                    .collect::<Vec<_>>()
            });

            let resp = json!({
                "type": "monitors_list",
                "monitors": monitors_info,
            });
            return Some(resp.to_string());
        }

        // ── Window management ─────────────────────────────────────────────
        RemoteCommand::GetWindows => {
            let windows = list_windows();
            let resp = json!({
                "type": "windows_list",
                "windows": windows
            });
            return Some(resp.to_string());
        }
        RemoteCommand::FocusWindow { id } => {
            focus_window(*id);
            return None;
        }

        // ── Clipboard ─────────────────────────────────────────────────────
        RemoteCommand::SetClipboard { text } => {
            if let Ok(mut cb) = arboard::Clipboard::new() {
                let _ = cb.set_text(text.clone());
            }
            return None;
        }
        RemoteCommand::GetClipboard => {
            let mut content = String::new();
            if let Ok(mut cb) = arboard::Clipboard::new() {
                if let Ok(text) = cb.get_text() {
                    content = text;
                }
            }
            let resp = json!({
                "type": "clipboard_text",
                "text": content
            });
            return Some(resp.to_string());
        }
        _ => {}
    }

    if let Err(e) = handler.lock().unwrap().handle(cmd) {
        eprintln!("[WS] Input error: {}", e);
    }

    None
}

async fn stream_screen(
    is_streaming: Arc<AtomicBool>,
    tx: tokio::sync::mpsc::Sender<Message>,
    monitor_index: usize,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("[WS] Starting screen capture stream (monitor {})...", monitor_index);

    // Fetch screen dimensions in a blocking context (xcap::Monitor is !Send)
    let (screen_w, screen_h, monitor_name, monitor_count) =
        tokio::task::spawn_blocking(move || {
            let monitors = xcap::Monitor::all().unwrap_or_default();
            let count = monitors.len();
            let idx = monitor_index.min(count.saturating_sub(1));
            if let Some(m) = monitors.into_iter().nth(idx) {
                let name = m
                    .name()
                    .unwrap_or_else(|_| format!("Display {}", idx + 1));
                (
                    m.width().unwrap_or(1920),
                    m.height().unwrap_or(1080),
                    name,
                    count,
                )
            } else {
                (1920u32, 1080u32, format!("Display {}", idx + 1), 1usize)
            }
        })
        .await?;

    // Send screen information to client
    let info_msg = json!({
        "type": "screen_info",
        "width": screen_w,
        "height": screen_h,
        "monitor_index": monitor_index,
        "monitor_name": monitor_name,
        "monitor_count": monitor_count,
    });
    let _ = tx.send(Message::Text(info_msg.to_string().into())).await;

    while is_streaming.load(Ordering::Relaxed) {
        let start_time = std::time::Instant::now();

        let idx = monitor_index;

        // Capture + encode entirely in a blocking thread (xcap::Monitor is !Send)
        let frame_result = tokio::task::spawn_blocking(move || -> Option<Vec<u8>> {
            let monitors = xcap::Monitor::all().ok()?;
            let monitor = monitors.into_iter().nth(idx)?;

            let rgba_img = monitor.capture_image().ok()?;

            // Drop alpha channel (JPEG does not support alpha)
            let rgb_img = DynamicImage::ImageRgba8(rgba_img).to_rgb8();

            // Downscale to 960px width to keep frame sizes small (~30-50 KB)
            let resized = if rgb_img.width() > 960 {
                let n_width = 960u32;
                let n_height =
                    (rgb_img.height() as f32 * (960.0 / rgb_img.width() as f32)) as u32;
                image::imageops::resize(
                    &rgb_img,
                    n_width,
                    n_height,
                    image::imageops::FilterType::Triangle,
                )
            } else {
                rgb_img
            };

            // Encode to JPEG with quality 50 via JpegEncoder
            use image::codecs::jpeg::JpegEncoder;
            let mut jpeg_buf = std::io::Cursor::new(Vec::new());
            let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_buf, 50);
            encoder.encode_image(&DynamicImage::ImageRgb8(resized)).ok()?;
            Some(jpeg_buf.into_inner())
        })
        .await;

        if let Ok(Some(bytes)) = frame_result {
            let b64_str = STANDARD.encode(&bytes);
            let frame_msg = json!({
                "type": "screen_frame",
                "image": format!("data:image/jpeg;base64,{}", b64_str)
            });
            // try_send drops frames if client is too slow — prevents cumulative lag
            let _ = tx.try_send(Message::Text(frame_msg.to_string().into()));
        }

        // Throttle to ~60 FPS (16ms target frame time)
        let elapsed = start_time.elapsed();
        let frame_delay = std::time::Duration::from_millis(16);
        if elapsed < frame_delay {
            tokio::time::sleep(frame_delay - elapsed).await;
        }
    }

    println!("[WS] Screen capture stream stopped (monitor {}).", monitor_index);
    Ok(())
}
