use crate::input_handler::{InputHandler, RemoteCommand};
use crate::window_manager::{focus_window, list_windows};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::net::SocketAddr;
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

    // Create an input handler per connection
    let handler = Arc::new(Mutex::new(InputHandler::new()?));

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let response = process_message(&text, &handler);
                if let Some(resp) = response {
                    if write.send(Message::Text(resp.into())).await.is_err() {
                        break;
                    }
                }
            }
            Ok(Message::Ping(data)) => {
                let _ = write.send(Message::Pong(data)).await;
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

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
