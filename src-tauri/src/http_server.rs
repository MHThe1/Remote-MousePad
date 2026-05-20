use axum::Router;
use tower_http::{cors::CorsLayer, services::ServeDir};
use std::net::SocketAddr;
use std::path::PathBuf;

fn find_mobile_dist() -> PathBuf {
    // 1. Check relative to the executable (production)
    if let Ok(exe) = std::env::current_exe() {
        let candidate = exe.parent().unwrap_or(std::path::Path::new(".")).join("mobile");
        if candidate.exists() {
            return candidate;
        }
    }

    // 2. Check relative to current working directory (dev mode)
    let dev_candidates = [
        "mobile/dist",
        "../mobile/dist",
        "../../mobile/dist",
    ];
    for path in dev_candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return p;
        }
    }

    // 3. Fallback
    PathBuf::from("mobile/dist")
}

pub async fn start_http_server(port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mobile_dist = find_mobile_dist();
    println!("[HTTP] Serving mobile PWA from: {}", mobile_dist.display());

    // Axum 0.8: use fallback_service instead of nest_service at root
    let serve_dir = ServeDir::new(&mobile_dist);

    let app = Router::new()
        .fallback_service(serve_dir)
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("[HTTP] Mobile PWA available at http://0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
