use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Instant,
};
use tauri::State;
use tiny_http::{Header, Response, Server, StatusCode};

const OVERLAY_TOKEN: &str = "tcg-9f2c7a81-reddice";
const OVERLAY_PORT: u16 = 17891;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OverlayCard {
    pub visible: bool,
    pub name: String,
    pub subtitle: String,
    pub image_url: String,
    pub atk: Option<i64>,
    pub def: Option<i64>,
    pub badge: String,
}

#[derive(Clone)]
pub struct OverlayShared(pub Arc<Mutex<OverlayCard>>);

#[derive(Debug, Serialize)]
pub struct OverlayInfo {
    pub url: String,
    pub state_url: String,
}

#[derive(Debug, Serialize)]
pub struct ApiStatus {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub latency_ms: u128,
    pub count: Option<u64>,
    pub detail: String,
}

#[derive(Debug, Serialize)]
pub struct CardResult {
    pub id: String,
    pub name: String,
    pub card_type: String,
    pub description: String,
    pub image_url: String,
    pub atk: Option<i64>,
    pub def: Option<i64>,
    pub level: Option<i64>,
    pub attribute: String,
    pub race: String,
}

#[derive(Debug, Serialize)]
pub struct ReleaseCheck {
    pub current: String,
    pub latest: String,
    pub update_available: bool,
    pub url: String,
}

fn json_response(body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..]).unwrap();
    Response::from_string(body).with_header(header)
}

fn html_response(body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    let header = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap();
    Response::from_string(body).with_header(header)
}

fn overlay_html() -> String {
    format!(r#"<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:100%;height:100%;background:transparent;overflow:hidden;font-family:Arial,sans-serif;color:#fff}}
#card{{position:absolute;left:5%;bottom:7%;display:none;align-items:center;gap:18px;min-width:560px;max-width:900px;padding:18px 22px;border:1px solid rgba(255,215,0,.65);border-radius:18px;background:linear-gradient(135deg,rgba(12,12,16,.94),rgba(28,23,8,.94));box-shadow:0 18px 70px rgba(0,0,0,.55),0 0 35px rgba(255,215,0,.12)}}
#art{{width:120px;height:168px;object-fit:cover;border-radius:10px;background:#111;border:2px solid #d3ad2b}}
.badge{{color:#ffd633;font-weight:900;font-size:13px;letter-spacing:.12em;text-transform:uppercase}}
h1{{font-size:30px;margin:5px 0 10px;line-height:1.05}} .stats{{display:flex;gap:10px;font-weight:800}} .pill{{padding:7px 10px;border-radius:8px;background:#241f08;color:#ffd633}} .def{{background:#0c1c35;color:#82aefa}} .sub{{margin-top:10px;color:#aaa;font-size:13px}}
</style></head><body><div id="card"><img id="art"><div><div class="badge" id="badge">TCG</div><h1 id="name"></h1><div class="stats"><span class="pill" id="atk"></span><span class="pill def" id="def"></span></div><div class="sub" id="subtitle"></div></div></div>
<script>
const stateUrl='http://127.0.0.1:{port}/state/{token}';
async function tick(){{try{{const r=await fetch(stateUrl,{{cache:'no-store'}});const s=await r.json();const c=document.getElementById('card');c.style.display=s.visible?'flex':'none';if(!s.visible)return;name.textContent=s.name||'';badge.textContent=s.badge||'TCG';subtitle.textContent=s.subtitle||'';art.src=s.image_url||'';art.style.display=s.image_url?'block':'none';atk.textContent=s.atk==null?'ATK —':'ATK '+s.atk;def.textContent=s.def==null?'DEF —':'DEF '+s.def;}}catch(e){{}}}};
setInterval(tick,250);tick();
</script></body></html>"#, port=OVERLAY_PORT, token=OVERLAY_TOKEN)
}

fn start_overlay_server(shared: OverlayShared) {
    thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", OVERLAY_PORT);
        let Ok(server) = Server::http(&addr) else { return; };
        for request in server.incoming_requests() {
            let url = request.url().to_string();
            if url == format!("/overlay/{}", OVERLAY_TOKEN) {
                let _ = request.respond(html_response(overlay_html()));
            } else if url == format!("/state/{}", OVERLAY_TOKEN) {
                let state = shared.0.lock().map(|s| s.clone()).unwrap_or_default();
                let body = serde_json::to_string(&state).unwrap_or_else(|_| "{}".into());
                let mut resp = json_response(body);
                resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).unwrap());
                resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                let _ = request.respond(resp);
            } else {
                let _ = request.respond(Response::empty(StatusCode(404)));
            }
        }
    });
}

#[tauri::command]
fn overlay_info() -> OverlayInfo {
    OverlayInfo {
        url: format!("http://127.0.0.1:{}/overlay/{}", OVERLAY_PORT, OVERLAY_TOKEN),
        state_url: format!("http://127.0.0.1:{}/state/{}", OVERLAY_PORT, OVERLAY_TOKEN),
    }
}

#[tauri::command]
fn set_overlay_card(shared: State<'_, OverlayShared>, card: OverlayCard) -> Result<(), String> {
    let mut state = shared.0.lock().map_err(|_| "Overlay indisponible".to_string())?;
    *state = card;
    Ok(())
}

#[tauri::command]
async fn api_status(game: String, api_url: Option<String>, api_key: Option<String>) -> ApiStatus {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("TCG-STREAM-TOOL/1.0.9")
        .build()
        .unwrap_or_default();

    let start = Instant::now();

    async fn send_json(
        client: &reqwest::Client,
        url: &str,
        api_key: Option<String>,
    ) -> Result<(reqwest::StatusCode, Value), String> {
        let mut req = client.get(url);
        if let Some(key) = api_key.filter(|s| !s.trim().is_empty()) {
            req = req.header("X-API-Key", key);
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status();
        let json = resp.json::<Value>().await.unwrap_or(Value::Null);
        Ok((status, json))
    }

    match game.as_str() {
        "ygo" => {
            let url = "https://db.ygoprodeck.com/api/v7/cardinfo.php?num=1&offset=0";
            match send_json(&client, url, None).await {
                Ok((status, json)) if status.is_success() => {
                    let count = json.pointer("/meta/total_rows").and_then(Value::as_u64);
                    ApiStatus {
                        id: "ygo".into(),
                        name: "YGOPRODeck".into(),
                        connected: true,
                        latency_ms: start.elapsed().as_millis(),
                        count,
                        detail: "YGOPRODeck API v7".into(),
                    }
                }
                Ok((status, _)) => ApiStatus {
                    id: "ygo".into(),
                    name: "YGOPRODeck".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: format!("HTTP {}", status),
                },
                Err(e) => ApiStatus {
                    id: "ygo".into(),
                    name: "YGOPRODeck".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: e,
                },
            }
        }

        "pokemon" => {
            let url = "https://api.pokemontcg.io/v2/cards?page=1&pageSize=1";
            match send_json(&client, url, None).await {
                Ok((status, json)) if status.is_success() => {
                    let count = json.get("totalCount").and_then(Value::as_u64);
                    ApiStatus {
                        id: "pokemon".into(),
                        name: "Pokémon TCG".into(),
                        connected: true,
                        latency_ms: start.elapsed().as_millis(),
                        count,
                        detail: "Pokémon TCG API".into(),
                    }
                }
                Ok((status, _)) => ApiStatus {
                    id: "pokemon".into(),
                    name: "Pokémon TCG".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: format!("HTTP {}", status),
                },
                Err(e) => ApiStatus {
                    id: "pokemon".into(),
                    name: "Pokémon TCG".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: e,
                },
            }
        }

        "onepiece" => {
            let url = api_url
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "https://optcgapi.com/api/allSets/".into());

            match send_json(&client, &url, api_key).await {
                Ok((status, json)) if status.is_success() => {
                    let count = json.as_array().map(|a| a.len() as u64)
                        .or_else(|| json.get("count").and_then(Value::as_u64))
                        .or_else(|| json.get("total").and_then(Value::as_u64))
                        .or_else(|| json.get("totalCount").and_then(Value::as_u64));

                    ApiStatus {
                        id: "onepiece".into(),
                        name: "One Piece".into(),
                        connected: true,
                        latency_ms: start.elapsed().as_millis(),
                        count,
                        detail: if api_url.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
                            "API personnalisée".into()
                        } else {
                            "OPTCG API".into()
                        },
                    }
                }
                Ok((status, _)) => ApiStatus {
                    id: "onepiece".into(),
                    name: "One Piece".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: format!("HTTP {}", status),
                },
                Err(e) => ApiStatus {
                    id: "onepiece".into(),
                    name: "One Piece".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: e,
                },
            }
        }

        "magic" => {
            let url = "https://api.scryfall.com/cards/search?q=%2A";
            match send_json(&client, url, None).await {
                Ok((status, json)) if status.is_success() => {
                    let count = json.get("total_cards").and_then(Value::as_u64);
                    ApiStatus {
                        id: "magic".into(),
                        name: "Magic / Scryfall".into(),
                        connected: true,
                        latency_ms: start.elapsed().as_millis(),
                        count,
                        detail: "Scryfall API".into(),
                    }
                }
                Ok((status, _)) => ApiStatus {
                    id: "magic".into(),
                    name: "Magic / Scryfall".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: format!("HTTP {}", status),
                },
                Err(e) => ApiStatus {
                    id: "magic".into(),
                    name: "Magic / Scryfall".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: e,
                },
            }
        }

        "vanguard" => {
            let url = "https://en.cf-vanguard.com/cardlist/cardsearch/";
            match client.get(url).send().await {
                Ok(resp) if resp.status().is_success() => ApiStatus {
                    id: "vanguard".into(),
                    name: "Cardfight!! Vanguard".into(),
                    connected: true,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: "Cardlist officielle connectée".into(),
                },
                Ok(resp) => ApiStatus {
                    id: "vanguard".into(),
                    name: "Cardfight!! Vanguard".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: format!("HTTP {}", resp.status()),
                },
                Err(e) => ApiStatus {
                    id: "vanguard".into(),
                    name: "Cardfight!! Vanguard".into(),
                    connected: false,
                    latency_ms: start.elapsed().as_millis(),
                    count: None,
                    detail: e.to_string(),
                },
            }
        }

        _ => ApiStatus {
            id: game,
            name: "API".into(),
            connected: false,
            latency_ms: 0,
            count: None,
            detail: "Source inconnue".into(),
        },
    }
}

#[tauri::command]
async fn search_ygo_card(query: String, language: Option<String>) -> Result<CardResult, String> {
    let query = query.trim();
    if query.is_empty() { return Err("Saisissez un nom de carte".into()); }
    let lang = language.unwrap_or_default();
    let mut url = format!("https://db.ygoprodeck.com/api/v7/cardinfo.php?fname={}", urlencoding::encode(query));
    if matches!(lang.as_str(), "fr" | "it" | "de" | "pt") {
        url.push_str("&language=");
        url.push_str(&lang);
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("TCG-STREAM-TOOL/1.0.9")
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("Carte introuvable (HTTP {})", resp.status())); }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let card = json.get("data").and_then(Value::as_array).and_then(|a| a.first()).ok_or_else(|| "Aucune carte trouvée".to_string())?;
    let image_url = card.pointer("/card_images/0/image_url").and_then(Value::as_str).unwrap_or("").to_string();
    Ok(CardResult {
        id: card.get("id").map(|v| v.to_string()).unwrap_or_default(),
        name: card.get("name").and_then(Value::as_str).unwrap_or("Carte").to_string(),
        card_type: card.get("type").and_then(Value::as_str).unwrap_or("").to_string(),
        description: card.get("desc").and_then(Value::as_str).unwrap_or("").to_string(),
        image_url,
        atk: card.get("atk").and_then(Value::as_i64),
        def: card.get("def").and_then(Value::as_i64),
        level: card.get("level").and_then(Value::as_i64),
        attribute: card.get("attribute").and_then(Value::as_str).unwrap_or("").to_string(),
        race: card.get("race").and_then(Value::as_str).unwrap_or("").to_string(),
    })
}

#[tauri::command]
async fn check_latest_release() -> Result<ReleaseCheck, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder().user_agent("TCG-STREAM-TOOL/1.0.9").build().map_err(|e| e.to_string())?;
    let resp = client.get("https://api.github.com/repos/reddice-geek/tcg-stream-tool/releases/latest").send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("GitHub HTTP {}", resp.status())); }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let latest = json.get("tag_name").and_then(Value::as_str).unwrap_or("").trim_start_matches('v').to_string();
    let url = json.get("html_url").and_then(Value::as_str).unwrap_or("").to_string();
    Ok(ReleaseCheck { update_available: version_gt(&latest, &current), current, latest, url })
}

fn version_gt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> { s.split('.').map(|x| x.parse::<u32>().unwrap_or(0)).collect() };
    let mut av = parse(a); let mut bv = parse(b);
    let len = av.len().max(bv.len()); av.resize(len, 0); bv.resize(len, 0);
    av > bv
}

#[tauri::command]
fn get_install_language() -> String {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey("Software\\ReddiceGeek\\TCGStreamTool") {
            if let Ok(value) = key.get_value::<String, _>("InstallerLanguage") {
                return match value.as_str() {
                    "1036" => "fr".into(),
                    "1040" => "it".into(),
                    "1034" | "3082" => "es".into(),
                    _ => "en".into(),
                };
            }
        }
    }
    "fr".into()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared = OverlayShared(Arc::new(Mutex::new(OverlayCard::default())));
    start_overlay_server(shared.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(shared)
        .invoke_handler(tauri::generate_handler![
            overlay_info,
            set_overlay_card,
            api_status,
            search_ygo_card,
            check_latest_release,
            get_install_language
        ])
        .run(tauri::generate_context!())
        .expect("error while running TCG STREAM TOOL");
}
