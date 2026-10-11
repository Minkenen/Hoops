use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
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
