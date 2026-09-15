use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
pub struct UniversalScanResult {
    pub card: CardResult,
    pub score: f64,
    pub product_id: u64,
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
async fn api_status(game: String, _api_url: Option<String>, _api_key: Option<String>) -> ApiStatus {
    let start = Instant::now();

    if game == "naruto" {
        return ApiStatus {
            id: "naruto".into(),
            name: "Naruto Mythos".into(),
            connected: true,
            latency_ms: start.elapsed().as_millis(),
            count: Some(130),
            detail: "Base locale Naruto Mythos Set 1".into(),
        };
    }

    let Some((game_id, display_name)) = open_tcg_game(&game) else {
        return ApiStatus {
            id: game,
            name: "API".into(),
            connected: false,
            latency_ms: 0,
            count: None,
            detail: "Source inconnue".into(),
        };
    };

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build()
    {
        Ok(c) => c,
        Err(e) => return ApiStatus { id:game, name:display_name.into(), connected:false, latency_ms:0, count:None, detail:e.to_string() },
    };

    let url = "https://openapi.tcgtracking.com/v1/categories";
    match client.get(url).send().await {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<Value>().await {
                Ok(json) => {
                    let entry = json.get("categories")
                        .and_then(Value::as_array)
                        .and_then(|arr| arr.iter().find(|x| x.get("id").and_then(Value::as_u64) == Some(game_id)));
                    if let Some(cat) = entry {
                        let count = cat.get("product_count").and_then(Value::as_u64);
                        ApiStatus {
                            id: game,
                            name: display_name.into(),
                            connected: true,
                            latency_ms: start.elapsed().as_millis(),
                            count,
                            detail: "Open TCG API • catalogue utilisé par le scanner visuel".into(),
                        }
                    } else {
                        ApiStatus { id:game, name:display_name.into(), connected:false, latency_ms:start.elapsed().as_millis(), count:None, detail:"Jeu absent du catalogue Open TCG".into() }
                    }
                }
                Err(e) => ApiStatus { id:game, name:display_name.into(), connected:false, latency_ms:start.elapsed().as_millis(), count:None, detail:e.to_string() },
            }
        }
        Ok(resp) => ApiStatus { id:game, name:display_name.into(), connected:false, latency_ms:start.elapsed().as_millis(), count:None, detail:format!("Open TCG HTTP {}",resp.status()) },
        Err(e) => ApiStatus { id:game, name:display_name.into(), connected:false, latency_ms:start.elapsed().as_millis(), count:None, detail:e.to_string() },
    }
}

fn open_tcg_game(game: &str) -> Option<(u64, &'static str)> {
    match game {
        "magic" => Some((1, "Magic: The Gathering")),
        "ygo" => Some((2, "Yu-Gi-Oh!")),
        "pokemon" => Some((3, "Pokémon")),
        "vanguard" => Some((16, "Cardfight!! Vanguard")),
        "weiss" => Some((20, "Weiss Schwarz")),
        "dragonball" => Some((27, "Dragon Ball Super")),
        "fleshblood" => Some((62, "Flesh and Blood")),
        "digimon" => Some((63, "Digimon")),
        "onepiece" => Some((68, "One Piece")),
        "lorcana" => Some((71, "Disney Lorcana")),
        "unionarena" => Some((81, "Union Arena")),
        _ => None,
    }
}


fn ygo_card_from_value(card: &Value) -> CardResult {
    CardResult {
        id: card.get("id").map(|v| v.to_string()).unwrap_or_default(),
        name: card.get("name").and_then(Value::as_str).unwrap_or("Carte").to_string(),
        card_type: card.get("type").and_then(Value::as_str).unwrap_or("").to_string(),
        description: card.get("desc").and_then(Value::as_str).unwrap_or("").to_string(),
        image_url: card.pointer("/card_images/0/image_url").and_then(Value::as_str).unwrap_or("").to_string(),
        atk: card.get("atk").and_then(Value::as_i64),
        def: card.get("def").and_then(Value::as_i64),
        level: card.get("level").and_then(Value::as_i64),
        attribute: card.get("attribute").and_then(Value::as_str).unwrap_or("").to_string(),
        race: card.get("race").and_then(Value::as_str).unwrap_or("").to_string(),
    }
}

fn strip_html(input: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => { in_tag = false; out.push(' '); },
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#039;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}


fn value_str<'a>(v: &'a Value, keys: &[&str]) -> &'a str {
    for key in keys {
        if let Some(s) = v.get(*key).and_then(Value::as_str) { return s; }
    }
    ""
}

fn norm(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn open_product_to_card(game: &str, root: &Value) -> CardResult {
    let product = root.get("product").unwrap_or(root);
    let number = value_str(product, &["number", "collector_number", "card_number"]);
    let product_id = product.get("id").map(|v| {
        v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())
    }).unwrap_or_default();
    let id = if !number.is_empty() { number.to_string() } else { product_id };
    let name = value_str(product, &["name", "clean_name"]);
    let set_name = value_str(product, &["set_name", "set"]);
    let set_abbr = value_str(product, &["set_abbr", "set_code"]);
    let rarity = value_str(product, &["rarity"]);
    let image = value_str(product, &["image_url", "image", "image_uri"]);
    let desc = [
        (!set_name.is_empty()).then_some(set_name),
        (!set_abbr.is_empty()).then_some(set_abbr),
        (!number.is_empty()).then_some(number),
        (!rarity.is_empty()).then_some(rarity),
    ].into_iter().flatten().collect::<Vec<_>>().join(" • ");
    CardResult {
        id,
        name: if name.is_empty() { "Carte reconnue".into() } else { name.into() },
        card_type: open_tcg_game(game).map(|x| x.1).unwrap_or("TCG").into(),
        description: desc,
        image_url: image.into(),
        atk: None,
        def: None,
        level: None,
        attribute: rarity.into(),
        race: if set_abbr.is_empty() { set_name.into() } else { format!("{} • {}", set_abbr, set_name) },
    }
}

#[tauri::command]
async fn scan_open_tcg(game: String, image_data_url: String) -> Result<UniversalScanResult, String> {
    let (game_id, _) = open_tcg_game(&game).ok_or_else(|| "Ce TCG n'est pas disponible dans le scanner visuel public".to_string())?;
    if !image_data_url.starts_with("data:image/") { return Err("Image caméra invalide".into()); }
    if image_data_url.len() > 140_000 { return Err("Image trop volumineuse pour le scanner public (100 Ko maximum)".into()); }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(22))
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build().map_err(|e| e.to_string())?;

    let scan = client.post("https://openapi.tcgtracking.com/v1/scan")
        .json(&json!({"game_id":game_id,"limit":5,"image":image_data_url}))
        .send().await.map_err(|e| format!("Scanner visuel indisponible : {}",e))?;
    if !scan.status().is_success() { return Err(format!("Scanner visuel HTTP {}",scan.status())); }
    let scan_json: Value = scan.json().await.map_err(|e| e.to_string())?;
    let best = scan_json.get("results").and_then(Value::as_array).and_then(|a| a.first())
        .ok_or_else(|| "Aucune correspondance visuelle trouvée pour cette carte".to_string())?;
    let product_id = best.get("product_id").and_then(Value::as_u64)
        .ok_or_else(|| "Réponse scanner sans identifiant produit".to_string())?;
    let score = best.get("score").and_then(Value::as_f64)
        .or_else(|| best.get("score").and_then(Value::as_u64).map(|x| x as f64)).unwrap_or(0.0);

    let product_url = format!("https://openapi.tcgtracking.com/v1/products/{}", product_id);
    let product_resp = client.get(product_url).send().await.map_err(|e| e.to_string())?;
    if !product_resp.status().is_success() { return Err(format!("Fiche carte HTTP {}",product_resp.status())); }
    let product_json: Value = product_resp.json().await.map_err(|e| e.to_string())?;
    let card = open_product_to_card(&game, &product_json);
    Ok(UniversalScanResult { card, score, product_id })
}

fn pokemon_card_from_value(card: &Value) -> CardResult {
    let base = value_str(card, &["image"]);
    let image_url = if base.is_empty() { String::new() } else { format!("{}/high.webp",base.trim_end_matches('/')) };
    CardResult {
        id: value_str(card, &["localId","id"]).into(),
        name: value_str(card, &["name"]).into(),
        card_type: value_str(card, &["category"]).into(),
        description: value_str(card, &["effect","description"]).into(),
        image_url,
        atk: None, def: None,
        level: card.get("level").and_then(Value::as_i64),
        attribute: value_str(card, &["rarity"]).into(),
        race: card.pointer("/set/name").and_then(Value::as_str).unwrap_or("").into(),
    }
}

#[tauri::command]
async fn search_card_universal(game: String, query: String, language: Option<String>) -> Result<CardResult, String> {
    let q = query.trim();
    if q.is_empty() { return Err("Saisissez un nom ou un numéro de carte".into()); }
    if game == "ygo" { return search_ygo_card(q.into(), language).await; }
    if game == "vanguard" { return search_vanguard_by_code(q.into()).await; }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(18))
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build().map_err(|e| e.to_string())?;
    let nq = norm(q);

    match game.as_str() {
        "pokemon" => {
            let lang = if language.as_deref()==Some("fr") { "fr" } else { "en" };
            let list_url = format!("https://api.tcgdex.net/v2/{}/cards",lang);
            let list: Value = client.get(list_url).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
            let card = list.as_array().and_then(|a| a.iter().find(|c| {
                let name=norm(value_str(c,&["name"])); let id=norm(value_str(c,&["id","localId"]));
                name==nq || id==nq || name.contains(&nq) || id.contains(&nq)
            })).ok_or_else(|| format!("Aucune carte Pokémon trouvée pour « {} »",q))?;
            let cid=value_str(card,&["id"]);
            let detail_url=format!("https://api.tcgdex.net/v2/{}/cards/{}",lang,urlencoding::encode(cid));
            let detail:Value=client.get(detail_url).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
            Ok(pokemon_card_from_value(&detail))
        }
        "magic" => {
            let url=format!("https://api.scryfall.com/cards/named?fuzzy={}",urlencoding::encode(q));
            let resp=client.get(url).send().await.map_err(|e|e.to_string())?;
            if !resp.status().is_success(){ return Err("Carte Magic introuvable".into()); }
            let v:Value=resp.json().await.map_err(|e|e.to_string())?;
            let img=v.pointer("/image_uris/normal").and_then(Value::as_str)
                .or_else(||v.pointer("/card_faces/0/image_uris/normal").and_then(Value::as_str)).unwrap_or("");
            Ok(CardResult{id:value_str(&v,&["collector_number","id"]).into(),name:value_str(&v,&["name"]).into(),card_type:value_str(&v,&["type_line"]).into(),description:value_str(&v,&["oracle_text"]).into(),image_url:img.into(),atk:None,def:None,level:None,attribute:value_str(&v,&["rarity"]).into(),race:v.pointer("/set_name").and_then(Value::as_str).unwrap_or("").into()})
        }
        "digimon" => {
            let is_code=q.chars().any(|c|c.is_ascii_digit()) && q.contains('-');
            let url=if is_code { format!("https://digimoncard.io/api-public/search?card={}&series=Digimon%20Card%20Game&limit=1",urlencoding::encode(q)) } else { format!("https://digimoncard.io/api-public/search?n={}&series=Digimon%20Card%20Game&limit=1",urlencoding::encode(q)) };
            let v:Value=client.get(url).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
            let c=v.as_array().and_then(|a|a.first()).ok_or_else(||"Carte Digimon introuvable".to_string())?;
            Ok(CardResult{id:value_str(c,&["id"]).into(),name:value_str(c,&["name"]).into(),card_type:value_str(c,&["type"]).into(),description:value_str(c,&["main_effect","source_effect"]).into(),image_url:String::new(),atk:c.get("dp").and_then(Value::as_i64),def:None,level:c.get("level").and_then(Value::as_i64),attribute:value_str(c,&["color","rarity"]).into(),race:value_str(c,&["digi_type","set_name"]).into()})
        }
        "fleshblood" => {
            let url=format!("https://api.goagain.dev/v1/cards?name={}&limit=1&offset=0",urlencoding::encode(q));
            let v:Value=client.get(url).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
            let c=v.get("data").and_then(Value::as_array).and_then(|a|a.first()).ok_or_else(||"Carte Flesh and Blood introuvable".to_string())?;
            let printing=c.get("printings").and_then(Value::as_array).and_then(|a|a.first());
            let img=printing.and_then(|p|p.get("image_url")).and_then(Value::as_str).unwrap_or("");
            let cid=printing.and_then(|p|p.get("id")).and_then(Value::as_str).unwrap_or_else(||value_str(c,&["unique_id"]));
            Ok(CardResult{id:cid.into(),name:value_str(c,&["name"]).into(),card_type:value_str(c,&["type_text"]).into(),description:value_str(c,&["functional_text_plain","functional_text"]).into(),image_url:img.into(),atk:c.get("power").and_then(Value::as_str).and_then(|s|s.parse().ok()),def:c.get("defense").and_then(Value::as_str).and_then(|s|s.parse().ok()),level:None,attribute:value_str(c,&["color"]).into(),race:printing.and_then(|p|p.get("set_id")).and_then(Value::as_str).unwrap_or("").into()})
        }
        "onepiece" => {
            for endpoint in ["allSetCards","allSTCards","allPromoCards","allDonCards"] {
                let url=format!("https://optcgapi.com/api/{}/",endpoint);
                let v:Value=client.get(url).send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
                if let Some(c)=v.as_array().and_then(|a|a.iter().find(|c| {
                    let name=norm(value_str(c,&["card_name","name"]));
                    let id=norm(value_str(c,&["card_set_id","card_id","card_number","id"]));
                    name==nq || id==nq || name.contains(&nq) || id.contains(&nq)
                })) {
                    return Ok(CardResult{id:value_str(c,&["card_set_id","card_id","card_number","id"]).into(),name:value_str(c,&["card_name","name"]).into(),card_type:value_str(c,&["card_type","type"]).into(),description:value_str(c,&["card_text","effect","description"]).into(),image_url:value_str(c,&["card_image","card_image_url","image_url","image"]).into(),atk:c.get("card_power").and_then(Value::as_i64).or_else(||c.get("power").and_then(Value::as_i64)),def:None,level:None,attribute:value_str(c,&["card_color","color","rarity"]).into(),race:value_str(c,&["set_name","card_set_name"]).into()});
                }
            }
            Err("Carte One Piece introuvable".into())
        }
        "lorcana" => {
            let v:Value=client.get("https://api.lorcana-api.com/bulk/cards").send().await.map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
            let c=v.as_array().and_then(|a|a.iter().find(|c| {
                let name=norm(value_str(c,&["Name","name","FullName","full_name"]));
                let id=norm(value_str(c,&["Card_Num","card_num","number","id"]));
                name==nq || id==nq || name.contains(&nq) || id.contains(&nq)
            })).ok_or_else(||"Carte Lorcana introuvable".to_string())?;
            Ok(CardResult{id:value_str(c,&["Card_Num","card_num","number","id"]).into(),name:value_str(c,&["Name","name","FullName","full_name"]).into(),card_type:value_str(c,&["Type","type"]).into(),description:value_str(c,&["Body_Text","body_text","Text","text"]).into(),image_url:value_str(c,&["Image","image","ImageUrl","image_url"]).into(),atk:None,def:None,level:None,attribute:value_str(c,&["Color","color","Rarity","rarity"]).into(),race:value_str(c,&["Set_Name","set_name"]).into()})
        }
        _ => Err(format!("Recherche texte directe indisponible pour {}. Le scanner caméra universel fonctionne pour ce TCG et récupère nom, numéro et image.", open_tcg_game(&game).map(|x|x.1).unwrap_or(&game))),
    }
}

#[tauri::command]
async fn search_ygo_by_id(passcode: String) -> Result<CardResult, String> {
    let code: String = passcode.chars().filter(|c| c.is_ascii_digit()).collect();
    if code.len() != 8 { return Err("Passcode Yu-Gi-Oh! invalide : 8 chiffres requis".into()); }
    let url = format!("https://db.ygoprodeck.com/api/v7/cardinfo.php?id={}", code);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("Passcode {} introuvable (HTTP {})", code, resp.status())); }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let card = json.get("data").and_then(Value::as_array).and_then(|a| a.first()).ok_or_else(|| "Aucune carte trouvée pour ce passcode".to_string())?;
    Ok(ygo_card_from_value(card))
}

#[tauri::command]
async fn search_vanguard_by_code(code: String) -> Result<CardResult, String> {
    let code = code.trim().to_uppercase().replace(' ', "");
    if !code.contains('/') || code.len() < 8 { return Err("Code Vanguard invalide".into()); }
    let url = format!(
        "https://en.cf-vanguard.com/cardlist/cardsearch/?keyword={}&keyword_type%5B0%5D=all&view=text",
        urlencoding::encode(&code)
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("Vanguard HTTP {}", resp.status())); }
    let html = resp.text().await.map_err(|e| e.to_string())?;
    let pos = html.to_uppercase().find(&code).ok_or_else(|| format!("Carte Vanguard {} introuvable", code))?;
    let end = (pos + 1400).min(html.len());
    let snippet = strip_html(&html[pos..end]);
    let after = snippet.strip_prefix(&code).unwrap_or(&snippet).trim();
    let name = after
        .split("Normal Unit")
        .next()
        .unwrap_or(after)
        .split("Trigger Unit")
        .next()
        .unwrap_or(after)
        .trim()
        .to_string();
    let clean_name = if name.is_empty() { code.clone() } else { name };
    Ok(CardResult {
        id: code.clone(),
        name: clean_name,
        card_type: "Cardfight!! Vanguard".into(),
        description: format!("Code officiel détecté : {}. Résultat trouvé dans la cardlist officielle Vanguard.", code),
        image_url: String::new(),
        atk: None,
        def: None,
        level: None,
        attribute: "Code exact".into(),
        race: code,
    })
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
        .user_agent("TCG-STREAM-TOOL/1.0.14")
        .build().map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() { return Err(format!("Carte introuvable (HTTP {})", resp.status())); }
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    let card = json.get("data").and_then(Value::as_array).and_then(|a| a.first()).ok_or_else(|| "Aucune carte trouvée".to_string())?;
    Ok(ygo_card_from_value(card))
}

#[tauri::command]
async fn check_latest_release() -> Result<ReleaseCheck, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder().user_agent("TCG-STREAM-TOOL/1.0.14").build().map_err(|e| e.to_string())?;
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
            search_ygo_by_id,
            search_vanguard_by_code,
            search_card_universal,
            scan_open_tcg,
            check_latest_release,
            get_install_language
        ])
        .run(tauri::generate_context!())
        .expect("error while running TCG STREAM TOOL");
}
