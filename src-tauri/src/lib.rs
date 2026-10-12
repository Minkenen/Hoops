use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

#[derive(Clone, Copy, Deserialize, Serialize)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Default)]
struct HitState {
    regions: Mutex<HashMap<String, Vec<Rect>>>,
    capture: Mutex<HashMap<String, Instant>>,
    over_fullscreen: Mutex<bool>,
}

#[derive(Serialize, Clone)]
struct MonitorInfo {
    index: usize,
    label: String,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    scale: f64,
    bottom_inset: f64,
}

fn monitor_infos(app: &AppHandle) -> Vec<MonitorInfo> {
    let monitors = app.available_monitors().unwrap_or_default();
    monitors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let pos = m.position();
            let size = m.size();
            let scale = m.scale_factor();
            let work = m.work_area();
            let full_bottom = pos.y as f64 + size.height as f64;
            let work_bottom = work.position.y as f64 + work.size.height as f64;
            let inset = ((full_bottom - work_bottom) / scale).max(0.0);
            MonitorInfo {
                index: i,
                label: format!("overlay-{i}"),
                x: pos.x,
                y: pos.y,
                w: size.width,
                h: size.height,
                scale,
                bottom_inset: inset,
            }
        })
        .collect()
}

#[tauri::command]
fn get_monitors(app: AppHandle) -> Vec<MonitorInfo> {
    monitor_infos(&app)
}

#[tauri::command]
fn set_hit_regions(window: tauri::Window, rects: Vec<Rect>, state: State<HitState>) {
    state
        .regions
        .lock()
        .unwrap()
        .insert(window.label().to_string(), rects);
}

#[tauri::command]
fn set_capture(window: tauri::Window, on: bool, state: State<HitState>) {
    let mut map = state.capture.lock().unwrap();
    if on {
        map.insert(window.label().to_string(), Instant::now());
    } else {
        map.remove(window.label());
    }
}

#[tauri::command]
fn activate_overlay(app: AppHandle, label: String) {
    for (l, w) in app.webview_windows() {
        if !l.starts_with("overlay-") {
            continue;
        }
        if l == label {
            let _ = w.show();
        } else {
            let _ = w.hide();
        }
    }
}

#[tauri::command]
fn set_over_fullscreen(app: AppHandle, on: bool, state: State<HitState>) {
    *state.over_fullscreen.lock().unwrap() = on;
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        for (l, w) in handle.webview_windows() {
            if l.starts_with("overlay-") {
                style_overlay(&w, on);
            }
        }
    });
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let allowed =
        url.starts_with("https://ko-fi.com/")
            || url.starts_with("https://minkenen.github.io/Hoops/")
            || url.starts_with("https://lemonsqueezy.com/")
            || url.starts_with("https://www.lemonsqueezy.com/")
            || url.starts_with("https://checkout.lemonsqueezy.com/")
            || url.starts_with("https://hoops.lemonsqueezy.com/");
    if !allowed {
        return Err("unsupported url".into());
    }

    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", &url]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");

    #[cfg(target_os = "macos")]
    cmd.arg(&url);
    #[cfg(all(unix, not(target_os = "macos")))]
    cmd.arg(&url);

    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn open_system_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", url]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");

    #[cfg(target_os = "macos")]
    cmd.arg(url);
    #[cfg(all(unix, not(target_os = "macos")))]
    cmd.arg(url);

    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn style_overlay(win: &WebviewWindow, over_fullscreen: bool) {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
    if let Ok(ptr) = win.ns_window() {
        let w: &NSWindow = unsafe { &*(ptr as *mut NSWindow) };
        let mut b = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle;
        if over_fullscreen {
            b |= NSWindowCollectionBehavior::FullScreenAuxiliary;
            w.setLevel(25);
        } else {
            w.setLevel(3);
        }
        w.setCollectionBehavior(b);
    }
}

#[cfg(not(target_os = "macos"))]
fn style_overlay(win: &WebviewWindow, _over_fullscreen: bool) {
    let _ = win.set_always_on_top(true);
}

fn build_overlays(app: &AppHandle) -> tauri::Result<()> {
    let infos = monitor_infos(app);
    for info in infos.iter() {
        let win = WebviewWindowBuilder::new(app, &info.label, WebviewUrl::App("index.html".into()))
            .title("Hoops")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .accept_first_mouse(true)
            .focused(false)
            .visible(false)
            .build()?;
        let _ = win.set_position(PhysicalPosition::new(info.x, info.y));
        let _ = win.set_size(PhysicalSize::new(info.w, info.h));
        let _ = win.set_ignore_cursor_events(true);
        style_overlay(&win, true);
    }
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|p| infos.iter().position(|i| i.x == p.position().x && i.y == p.position().y))
        .unwrap_or(0);
    if let Some(w) = app.get_webview_window(&format!("overlay-{primary}")) {
        let _ = w.show();
    }
    Ok(())
}

fn spawn_cursor_thread(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: HashMap<String, bool> = HashMap::new();
        let mut inside_last: HashMap<String, bool> = HashMap::new();
        loop {
            let mut near = false;
            let state = app.state::<HitState>();
            if let Ok(cursor) = app.cursor_position() {
                for (label, win) in app.webview_windows() {
                    if !label.starts_with("overlay-") || !win.is_visible().unwrap_or(false) {
                        continue;
                    }
                    let (Ok(pos), Ok(scale)) = (win.outer_position(), win.scale_factor()) else {
                        continue;
                    };
                    let lx = (cursor.x - pos.x as f64) / scale;
                    let ly = (cursor.y - pos.y as f64) / scale;
                    let cap = state
                        .capture
                        .lock()
                        .unwrap()
                        .get(&label)
                        .map(|t| t.elapsed() < Duration::from_millis(2500))
                        .unwrap_or(false);
                    let (inside, close) = state
                        .regions
                        .lock()
                        .unwrap()
                        .get(&label)
                        .map(|v| {
                            let inside = v
                                .iter()
                                .any(|r| lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
                            let close = v.iter().any(|r| {
                                lx >= r.x - 160.0
                                    && lx <= r.x + r.w + 160.0
                                    && ly >= r.y - 160.0
                                    && ly <= r.y + r.h + 160.0
                            });
                            (inside, close)
                        })
                        .unwrap_or((false, false));
                    near |= close || cap;
                    if inside_last.get(&label) != Some(&inside) {
                        inside_last.insert(label.clone(), inside);
                        let _ = app.emit_to(label.as_str(), "cursor-inside", inside);
                    }
                    let ignore = !(inside || cap);
                    if last.get(&label) != Some(&ignore) {
                        let _ = win.set_ignore_cursor_events(ignore);
                        last.insert(label.clone(), ignore);
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(if near { 12 } else { 80 }));
        }
    });
}

#[derive(Serialize)]
struct LicenseActivation {
    instance_id: String,
    unlock: String,
    theme_id: String,
}

#[derive(Clone, Copy)]
struct LicensedProduct {
    product_id: u64,
    unlock: &'static str,
    theme_id: &'static str,
}

/// Lemon Squeezy product ids. They are not secrets (the license API needs no API key),
/// but they can be set at build time, e.g. `HOOPS_LS_STORE_ID=12345 HOOPS_LS_PRODUCT_ID=67890 npm run tauri build`.
fn ls_id(v: Option<&str>, fallback: u64) -> u64 {
    v.and_then(|s| s.parse().ok()).unwrap_or(fallback)
}

fn licensed_products() -> Vec<LicensedProduct> {
    [
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_PRODUCT_ID"), 1430835),
            unlock: "all",
            theme_id: "",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_STREET_PRODUCT_ID"), 1431014),
            unlock: "theme",
            theme_id: "street",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_ARENA_PRODUCT_ID"), 1431019),
            unlock: "theme",
            theme_id: "arena",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_LED_PRODUCT_ID"), 1431020),
            unlock: "theme",
            theme_id: "led",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_TRAIN_DAY_PRODUCT_ID"), 1431022),
            unlock: "theme",
            theme_id: "train-day",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_TRAIN_NIGHT_PRODUCT_ID"), 1431023),
            unlock: "theme",
            theme_id: "train-night",
        },
        LicensedProduct {
            product_id: ls_id(option_env!("HOOPS_LS_THEME_TRAIN_CANYON_PRODUCT_ID"), 1431024),
            unlock: "theme",
            theme_id: "train-canyon",
        },
    ]
    .into_iter()
    .filter(|p| p.product_id != 0)
    .collect()
}

fn lemon_activate(key: &str, store_id: u64, products: &[LicensedProduct]) -> Result<LicenseActivation, String> {
    let name = format!("Hoops on {}", std::env::consts::OS);
    let body: serde_json::Value = match ureq::post("https://api.lemonsqueezy.com/v1/licenses/activate")
        .set("Accept", "application/json")
        .send_form(&[("license_key", key), ("instance_name", name.as_str())])
    {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        // Lemon Squeezy answers a bad key with an error status and a JSON body that says why.
        Err(ureq::Error::Status(_, r)) => r.into_json().map_err(|e| e.to_string())?,
        Err(_) => return Err("Could not reach the license server. Check your internet connection.".into()),
    };
    if body["activated"].as_bool() != Some(true) {
        let msg = body["error"].as_str().unwrap_or("That license key was not accepted.");
        return Err(msg.to_string());
    }
    let meta = &body["meta"];
    let product_id = meta["product_id"].as_u64().unwrap_or_default();
    let Some(product) = products.iter().find(|p| p.product_id == product_id) else {
        return Err("That license key is for a different product.".into());
    };
    if meta["store_id"].as_u64() != Some(store_id) {
        return Err("That license key is for a different product.".into());
    }
    let instance_id = body["instance"]["id"].as_str().unwrap_or_default().to_string();
    Ok(LicenseActivation {
        instance_id,
        unlock: product.unlock.into(),
        theme_id: product.theme_id.into(),
    })
}

/// Activates a Hoops license key. The page only ever sees success or an error message.
#[tauri::command]
async fn activate_license(key: String) -> Result<LicenseActivation, String> {
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err("Enter your license key.".into());
    }
    let store_id = ls_id(option_env!("HOOPS_LS_STORE_ID"), 495291);
    let products = licensed_products();
    if store_id == 0 || products.is_empty() {
        // Not set up yet. Only a debug build accepts a test key, so a release build can never unlock for free.
        if cfg!(debug_assertions) && key == "HOOPS-TEST-KEY" {
            return Ok(LicenseActivation {
                instance_id: "dev".into(),
                unlock: "all".into(),
                theme_id: "".into(),
            });
        }
        return Err("Licensing is not set up in this build yet.".into());
    }
    tauri::async_runtime::spawn_blocking(move || lemon_activate(&key, store_id, &products))
        .await
        .map_err(|e| e.to_string())?
}

fn lemon_validate(key: &str) -> Result<bool, String> {
    let body: serde_json::Value = match ureq::post("https://api.lemonsqueezy.com/v1/licenses/validate")
        .set("Accept", "application/json")
        .send_form(&[("license_key", key)])
    {
        Ok(r) => r.into_json().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(_, r)) => r.into_json().map_err(|e| e.to_string())?,
        Err(_) => return Err("Could not reach the license server.".into()),
    };
    Ok(body["valid"].as_bool() == Some(true))
}

/// Checks that a license key is still valid (for example not refunded). An error means "could not tell", not "invalid".
#[tauri::command]
async fn validate_license(key: String) -> Result<bool, String> {
    if cfg!(debug_assertions) && key == "HOOPS-TEST-KEY" {
        return Ok(true);
    }
    tauri::async_runtime::spawn_blocking(move || lemon_validate(&key))
        .await
        .map_err(|e| e.to_string())?
}

const LEADERBOARD_SERVICE: &str = "Hoops";
const LEADERBOARD_ACCOUNT: &str = "leaderboard-session";

#[derive(Deserialize, Serialize, Clone)]
struct LbUser {
    id: String,
    nickname: String,
}

#[derive(Deserialize, Serialize)]
struct LbEntry {
    rank: u32,
    name: String,
    score: u32,
    icon: u32,
}

#[derive(Deserialize, Serialize)]
struct LbBoard {
    top: Vec<LbEntry>,
    you: Option<LbEntry>,
    players: u32,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

#[derive(Deserialize)]
struct LbSession {
    user: LbUser,
}

#[derive(Serialize)]
struct LbScore {
    score: u32,
    #[serde(rename = "bestStreak")]
    best_streak: u32,
    throws: u32,
    goals: u32,
}

#[derive(Serialize)]
struct LbNickname {
    nickname: String,
}

fn leaderboard_keyring() -> Result<keyring::Entry, String> {
    keyring::Entry::new(LEADERBOARD_SERVICE, LEADERBOARD_ACCOUNT).map_err(|e| e.to_string())
}

/// The session token, read from the keychain once per run (every read can make macOS ask for the password) and kept here after that.
static TOKEN_CACHE: std::sync::Mutex<Option<Option<String>>> = std::sync::Mutex::new(None);

fn get_leaderboard_token() -> Option<String> {
    let mut cache = TOKEN_CACHE.lock().ok()?;
    if let Some(v) = cache.as_ref() {
        return v.clone();
    }
    let v = leaderboard_keyring().ok().and_then(|k| k.get_password().ok());
    *cache = Some(v.clone());
    v
}

fn set_leaderboard_token(token: &str) -> Result<(), String> {
    leaderboard_keyring()?.set_password(token).map_err(|e| e.to_string())?;
    if let Ok(mut cache) = TOKEN_CACHE.lock() {
        *cache = Some(Some(token.to_string()));
    }
    Ok(())
}

fn clear_leaderboard_token() {
    if let Ok(entry) = leaderboard_keyring() {
        let _ = entry.delete_credential();
    }
    if let Ok(mut cache) = TOKEN_CACHE.lock() {
        *cache = Some(None);
    }
}

fn leaderboard_url(base: &str, path: &str) -> Result<String, String> {
    let base = base.trim().trim_end_matches('/');
    if !base.starts_with("https://") && !base.starts_with("http://127.0.0.1:") && !base.starts_with("http://localhost:") {
        return Err("The leaderboard server URL must use HTTPS.".into());
    }
    Ok(format!("{base}{path}"))
}

fn leaderboard_get<T: for<'de> Deserialize<'de>>(base: &str, path: &str, token: Option<&str>) -> Result<T, String> {
    let url = leaderboard_url(base, path)?;
    let mut req = ureq::get(&url).set("Accept", "application/json");
    if let Some(token) = token {
        req = req.set("Authorization", &format!("Bearer {token}"));
    }
    match req.call() {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, r)) => Err(r.into_string().unwrap_or_else(|_| "Leaderboard request failed.".into())),
        Err(_) => Err("Could not reach the leaderboard server.".into()),
    }
}

fn leaderboard_post<B: Serialize, T: for<'de> Deserialize<'de>>(base: &str, path: &str, token: Option<&str>, body: &B) -> Result<T, String> {
    let url = leaderboard_url(base, path)?;
    let mut req = ureq::post(&url).set("Accept", "application/json");
    if let Some(token) = token {
        req = req.set("Authorization", &format!("Bearer {token}"));
    }
    match req.send_json(serde_json::to_value(body).map_err(|e| e.to_string())?) {
        Ok(r) => r.into_json().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(_, r)) => Err(leaderboard_error_message(r)),
        Err(_) => Err("Could not reach the leaderboard server.".into()),
    }
}

fn leaderboard_error_message(r: ureq::Response) -> String {
    let text = r.into_string().unwrap_or_else(|_| "Leaderboard request failed.".into());
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or(text)
}

fn read_loopback_callback(listener: TcpListener) -> Result<String, String> {
    let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
    let mut buf = [0_u8; 4096];
    let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
    let req = String::from_utf8_lossy(&buf[..n]);
    let first = req.lines().next().unwrap_or_default();
    let path = first.split_whitespace().nth(1).unwrap_or_default();
    let body = b"<html><body>You can close this window and return to Hoops.</body></html>";
    let _ = stream.write_all(
        format!(
            "HTTP/1.1 200 OK\r\ncontent-type: text/html\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
            body.len()
        )
        .as_bytes(),
    );
    let _ = stream.write_all(body);
    path.split('?')
        .nth(1)
        .and_then(|q| q.split('&').find_map(|p| p.strip_prefix("token=").map(|v| v.replace("%2E", "."))))
        .ok_or_else(|| "Sign-in did not return a session.".into())
}

#[tauri::command]
async fn leaderboard_user(server_url: String) -> Result<Option<LbUser>, String> {
    let Some(token) = get_leaderboard_token() else {
        return Ok(None);
    };
    let session: LbSession = tauri::async_runtime::spawn_blocking(move || leaderboard_get(&server_url, "/me", Some(&token)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Some(session.user))
}

#[tauri::command]
fn leaderboard_session_token() -> Option<String> {
    get_leaderboard_token()
}

#[tauri::command]
async fn leaderboard_sign_in(app: AppHandle, server_url: String, provider: String) -> Result<LbUser, String> {
    if provider != "apple" && provider != "google" {
        return Err("Unsupported sign-in provider.".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let redirect = redirect.replace(':', "%3A").replace('/', "%2F");
    let auth_url = leaderboard_url(&server_url, &format!("/auth/start?provider={provider}&redirect_uri={redirect}"))?;
    app.run_on_main_thread(move || {
        let _ = open_system_url(&auth_url);
    })
    .map_err(|e| e.to_string())?;
    let token = tauri::async_runtime::spawn_blocking(move || read_loopback_callback(listener))
        .await
        .map_err(|e| e.to_string())??;
    set_leaderboard_token(&token)?;
    let session: LbSession = tauri::async_runtime::spawn_blocking(move || leaderboard_get(&server_url, "/me", Some(&token)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(session.user)
}

#[tauri::command]
fn leaderboard_sign_out() {
    clear_leaderboard_token();
}

#[tauri::command]
async fn leaderboard_load(server_url: String, tab: String) -> Result<LbBoard, String> {
    let tab = match tab.as_str() {
        "global" | "weekly" | "friends" => tab,
        _ => return Err("Unsupported leaderboard tab.".into()),
    };
    let token = get_leaderboard_token();
    tauri::async_runtime::spawn_blocking(move || leaderboard_get(&server_url, &format!("/leaderboard?tab={tab}"), token.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn leaderboard_submit_score(server_url: String, score: u32, best_streak: u32, throws: u32, goals: u32) -> Result<(), String> {
    let Some(token) = get_leaderboard_token() else {
        return Ok(());
    };
    let body = LbScore {
        score,
        best_streak,
        throws,
        goals,
    };
    tauri::async_runtime::spawn_blocking(move || leaderboard_post::<_, serde_json::Value>(&server_url, "/score", Some(&token), &body))
        .await
        .map_err(|e| e.to_string())??;
    Ok(())
}

#[tauri::command]
async fn leaderboard_set_nickname(server_url: String, nickname: String) -> Result<LbUser, String> {
    let Some(token) = get_leaderboard_token() else {
        return Err("Sign in first.".into());
    };
    let body = LbNickname { nickname };
    tauri::async_runtime::spawn_blocking(move || leaderboard_post(&server_url, "/nickname", Some(&token), &body))
        .await
        .map_err(|e| e.to_string())?
}

/// Deletes the account on the server (name, scores and saved profile) and forgets the session on this computer.
#[tauri::command]
async fn leaderboard_delete_account(server_url: String) -> Result<(), String> {
    let Some(token) = get_leaderboard_token() else {
        return Ok(());
    };
    tauri::async_runtime::spawn_blocking(move || {
        let url = leaderboard_url(&server_url, "/account")?;
        match ureq::delete(&url).set("Authorization", &format!("Bearer {token}")).call() {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(_, r)) => Err(leaderboard_error_message(r)),
            Err(_) => Err("Could not reach the leaderboard server.".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    clear_leaderboard_token();
    Ok(())
}

/// The profile saved on the account: stats, best score, cosmetics and licenses. null when nothing is saved yet.
#[tauri::command]
async fn leaderboard_profile_get(server_url: String) -> Result<serde_json::Value, String> {
    let Some(token) = get_leaderboard_token() else {
        return Ok(serde_json::Value::Null);
    };
    let r: serde_json::Value = tauri::async_runtime::spawn_blocking(move || leaderboard_get(&server_url, "/profile", Some(&token)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(r.get("profile").cloned().unwrap_or(serde_json::Value::Null))
}

#[tauri::command]
async fn leaderboard_profile_put(server_url: String, profile: serde_json::Value) -> Result<(), String> {
    let Some(token) = get_leaderboard_token() else {
        return Ok(());
    };
    tauri::async_runtime::spawn_blocking(move || {
        let url = leaderboard_url(&server_url, "/profile")?;
        match ureq::put(&url)
            .set("Accept", "application/json")
            .set("Authorization", &format!("Bearer {token}"))
            .send_json(profile)
        {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(_, r)) => Err(leaderboard_error_message(r)),
            Err(_) => Err("Could not reach the leaderboard server.".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens or closes the Hoops menu on the visible overlays: the same thing the global shortcut does.
fn toggle_menu(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay-") && win.is_visible().unwrap_or(false) {
            let _ = app.emit_to(label.as_str(), "toggle-menu", ());
        }
    }
}

/// A menu bar / system tray icon: click it to start the game, right-click (or Ctrl-click) for Quit.
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Hoops", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Hoops", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("hoops")
        .tooltip("Hoops")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => toggle_menu(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_menu(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_menu(app);
                    }
                })
                .build(),
        )
        .manage(HitState::default())
        .invoke_handler(tauri::generate_handler![
            get_monitors,
            set_hit_regions,
            set_capture,
            activate_overlay,
            set_over_fullscreen,
            open_external,
            activate_license,
            validate_license,
            leaderboard_user,
            leaderboard_session_token,
            leaderboard_sign_in,
            leaderboard_sign_out,
            leaderboard_load,
            leaderboard_submit_score,
            leaderboard_set_nickname,
            leaderboard_delete_account,
            leaderboard_profile_get,
            leaderboard_profile_put,
            quit_app
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            build_overlays(&handle)?;
            if let Err(e) = build_tray(&handle) {
                eprintln!("could not create the tray icon: {e}");
            }
            let sc = Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER),
                Code::KeyB,
            );
            if let Err(e) = app.global_shortcut().register(sc) {
                eprintln!("could not register global shortcut: {e}");
            }
            spawn_cursor_thread(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hoops");
}
