const KEYHASH = "7b263077ed11d99ad62766d75a84071323d29cc9297cb1790c9c1ea80f710e73";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const e = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const S = { db: null, me: null, us: [], cu: [], in: [], as: [] }; let newDias = [], stream = null, scanning = false, lastCode = "", lastT = 0;
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const enc = s => new TextEncoder().encode(s);
async function hp(p, salt) { const k = await crypto.subtle.importKey("raw", enc(p), "PBKDF2", false, ["deriveBits"]); return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc(salt), iterations: 100000, hash: "SHA-256" }, k, 256)) }
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", enc(s))) }
const rnd = n => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = ""; crypto.getRandomValues(new Uint8Array(n)).forEach(x => r += a[x % a.length]); return r };
const msg = (id, t, ok) => { const m = $(id); m.textContent = t; m.className = "msg " + (ok ? "ok" : "er") };
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
const fmt = d => { const [y, m, x] = d.split("-"); return x + "/" + m };
const full = u => [u.nombre, u.apellido_paterno, u.apellido_materno].filter(Boolean).join(" ");
const sess = (v) => { try { v === undefined ? 0 : (v ? sessionStorage.setItem("fm", v) : sessionStorage.removeItem("fm")); return sessionStorage.getItem("fm") } catch (x) { return null } };

/* tabs */
$$("[data-a]").forEach(b => b.onclick = () => { $$("[data-a]").forEach(x => x.classList.toggle("on", x === b));["in", "reg", "adm"].forEach(k => $("#a-" + k).classList.toggle("hide", k !== b.dataset.a)) });
$$("#atabs button").forEach(b => b.onclick = () => { $$("#atabs button").forEach(x => x.classList.toggle("on", x === b));["cur", "ins", "asi"].forEach(k => $("#t-" + k).classList.toggle("hide", k !== b.dataset.t)); if (b.dataset.t !== "asi") stopCam() });
$$("[data-out]").forEach(b => b.onclick = () => { stopCam(); S.me = null; sess(null); show() });

function show() {
    $("#auth").classList.toggle("hide", !!S.me); $("#user").classList.toggle("hide", !S.me || S.me.rol === "admin"); $("#admin").classList.toggle("hide", !S.me || S.me.rol !== "admin");
    if (S.me) { S.me.rol === "admin" ? ($("#d-name").textContent = S.me.nombre) : ($("#u-name").textContent = full(S.me), $("#u-folio").textContent = S.me.folio); } paint()
}
function needDb(id) { if (!S.db) { msg(id, "Base de datos no disponible. Abre la página con tu sesión de claude.ai."); return true } }

/* auth */
$("#b-reg").onclick = async () => {
    if (needDb("#m-reg")) return; const nombre = $("#r-nom").value.trim(), mail = $("#r-mail").value.trim().toLowerCase(), pw = $("#r-pass").value;
    if (!nombre || !/^\S+@\S+\.\S+$/.test(mail)) return msg("#m-reg", "Nombre y correo válidos son obligatorios."); if (pw.length < 6) return msg("#m-reg", "La contraseña debe tener al menos 6 caracteres.");
    if (S.us.some(u => u.correo === mail)) return msg("#m-reg", "Ese correo ya está registrado.");
    let folio; do { folio = "FM-" + rnd(6) } while (S.us.some(u => u.folio === folio)); const salt = rnd(16);
    try {
        await S.db.collection("usuarios").doc(folio).set({ folio, rol: "user", nombre, apellido_paterno: $("#r-ap").value.trim(), apellido_materno: $("#r-am").value.trim(), correo: mail, salt, hash: await hp(pw, salt), creado: new Date().toISOString() });
        msg("#m-reg", "Cuenta creada. Tu folio es " + folio + ". Ya puedes entrar.", 1); $("#l-mail").value = mail; $$("[data-a]")[0].click()
    } catch (x) { msg("#m-reg", "No se pudo crear: " + (x.message || x.code)) }
};
$("#b-adm").onclick = async () => {
    if (needDb("#m-adm")) return; const nombre = $("#d-nom").value.trim(), mail = $("#d-mail").value.trim().toLowerCase(), pw = $("#d-pass").value;
    if (await sha($("#d-key").value.trim().toUpperCase()) !== KEYHASH) return msg("#m-adm", "Key de administrador incorrecta.");
    if (!nombre || !/^\S+@\S+\.\S+$/.test(mail) || pw.length < 6) return msg("#m-adm", "Completa nombre, correo y contraseña (mín. 6).");
    if (S.us.some(u => u.correo === mail)) return msg("#m-adm", "Ese correo ya está registrado.");
    const id = "ADM-" + rnd(6), salt = rnd(16); try {
        await S.db.collection("usuarios").doc(id).set({ folio: id, rol: "admin", nombre, correo: mail, salt, hash: await hp(pw, salt), creado: new Date().toISOString() });
        msg("#m-adm", "Administrador creado. Ya puedes entrar.", 1); $("#l-mail").value = mail; $$("[data-a]")[0].click()
    } catch (x) { msg("#m-adm", "Error: " + (x.message || x.code)) }
};
$("#b-in").onclick = async () => {
    if (needDb("#m-in")) return; const mail = $("#l-mail").value.trim().toLowerCase(), u = S.us.find(x => x.correo === mail);
    if (!u || await hp($("#l-pass").value, u.salt) !== u.hash) return msg("#m-in", "Correo o contraseña incorrectos."); $("#l-pass").value = ""; msg("#m-in", ""); S.me = u; sess(u.folio); show()
};
$("#b-pw").onclick = async () => {
    const o = $("#p-old").value, n = $("#p-new").value; if (n.length < 6) return msg("#m-pw", "La nueva contraseña debe tener al menos 6 caracteres.");
    if (await hp(o, S.me.salt) !== S.me.hash) return msg("#m-pw", "La contraseña actual es incorrecta."); const salt = rnd(16);
    try { const hash = await hp(n, salt); await S.db.doc("usuarios/" + S.me.folio).update({ salt, hash }); $("#p-old").value = $("#p-new").value = ""; msg("#m-pw", "Contraseña actualizada.", 1) } catch (x) { msg("#m-pw", "Error: " + (x.message || x.code)) }
};

/* user */
$("#b-qr").onclick = () => { const b = $("#qrbox"); b.classList.toggle("hide"); if (!b.classList.contains("hide")) { $("#qr").innerHTML = ""; if (window.QRCode) new QRCode($("#qr"), { text: S.me.folio, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); else $("#qr").textContent = S.me.folio } $("#b-qr").textContent = b.classList.contains("hide") ? "Mostrar QR" : "Ocultar QR" };
const inscId = (c, f) => c + "__" + f;
function paintUser() {
    const my = S.in.filter(i => i.folio === S.me.folio).map(i => i.curso);
    $("#u-cursos").innerHTML = S.cu.length ? S.cu.map(c => { const on = my.includes(c.id); return `<div class="row"><div><b>${e(c.nombre)}</b><div class="mu">${e(c.descripcion || "")} ${c.dias?.length ? "· Días: " + c.dias.map(fmt).join(", ") : ""}</div></div><button class="${on ? "d" : ""}" data-c="${c.id}" data-on="${on ? 1 : 0}">${on ? "Darme de baja" : "Inscribirme"}</button></div>` }).join("") : '<div class="mu">Aún no hay cursos disponibles.</div>';
    $$("#u-cursos button").forEach(b => b.onclick = async () => { const id = inscId(b.dataset.c, S.me.folio); try { b.dataset.on === "1" ? await S.db.doc("inscripciones/" + id).delete() : await S.db.doc("inscripciones/" + id).set({ curso: b.dataset.c, folio: S.me.folio }) } catch (x) { alert("Error: " + (x.message || x.code)) } })
}

/* admin: cursos */
$("#b-dia").onclick = () => { const d = $("#c-dia").value; if (d && !newDias.includes(d)) { newDias.push(d); newDias.sort(); $("#c-dias").textContent = "Días: " + newDias.map(fmt).join(", ") } };
$("#b-cur").onclick = async () => {
    const nombre = $("#c-nom").value.trim(); if (!nombre) return msg("#m-cur", "Escribe el nombre del curso."); if (!newDias.length) return msg("#m-cur", "Agrega al menos un día.");
    try { await S.db.doc("cursos/c" + Date.now()).set({ nombre, descripcion: $("#c-des").value.trim(), dias: newDias }); newDias = []; $("#c-nom").value = $("#c-des").value = ""; $("#c-dias").textContent = "Sin días agregados"; msg("#m-cur", "Curso creado.", 1) } catch (x) { msg("#m-cur", "Error: " + (x.message || x.code)) }
};
function paintAdmin() {
    $("#l-cur").innerHTML = S.cu.map(c => `<div class="row"><div><b>${e(c.nombre)}</b><div class="mu">${(c.dias || []).map(fmt).join(", ")} · ${S.in.filter(i => i.curso === c.id).length} inscritos</div></div><button class="d" data-del="${c.id}">Eliminar</button></div>`).join("") || '<div class="mu">Sin cursos.</div>';
    $$("[data-del]").forEach(b => b.onclick = async () => { if (!confirm("¿Eliminar el curso y sus inscripciones?")) return; const id = b.dataset.del; await S.db.doc("cursos/" + id).delete(); for (const i of S.in.filter(i => i.curso === id)) await S.db.doc("inscripciones/" + i.id).delete(); for (const a of S.as.filter(a => a.curso === id)) await S.db.doc("asistencias/" + a.id).delete() });
    $("#l-ins").innerHTML = S.cu.map(c => {
        const us = S.in.filter(i => i.curso === c.id).map(i => S.us.find(u => u.folio === i.folio)).filter(Boolean);
        return `<h3 style="font-size:15px;margin:14px 0 4px">${e(c.nombre)} <span class="mu">(${us.length})</span></h3>` + (us.length ? us.map(u => `<div class="row"><span>${e(full(u))}</span><span class="mu">${e(u.folio)} · ${e(u.correo)}</span></div>`).join("") : '<div class="mu">Nadie inscrito.</div>')
    }).join("") || '<div class="mu">Sin cursos.</div>';
    const sc = $("#s-cur"), cur = sc.value; sc.innerHTML = S.cu.map(c => `<option value="${c.id}">${e(c.nombre)}</option>`).join(""); if (S.cu.some(c => c.id === cur)) sc.value = cur; paintDias(); paintTable()
}
function curSel() { return S.cu.find(c => String(c.id) === $("#s-cur").value) }
function paintDias() {
    const c = curSel(), sd = $("#s-dia"), v = sd.value; sd.innerHTML = (c?.dias || []).map(d => `<option value="${d}">${fmt(d)}${d === today() ? " (hoy)" : ""}</option>`).join("");
    if (c?.dias?.includes(v)) sd.value = v; else if (c?.dias?.includes(today())) sd.value = today()
}
$("#s-cur").onchange = () => { paintDias(); paintTable() };
function paintTable() {
    const c = curSel(); if (!c) { $("#l-asi").innerHTML = '<div class="mu">Selecciona un curso.</div>'; return }
    const us = S.in.filter(i => i.curso === c.id).map(i => S.us.find(u => u.folio === i.folio)).filter(Boolean);
    $("#l-asi").innerHTML = us.length ? `<table><tr><th>Usuario</th>${c.dias.map(d => `<th>${fmt(d)}</th>`).join("")}</tr>` + us.map(u => { const a = S.as.find(a => a.id === inscId(c.id, u.folio)); return `<tr><td>${e(full(u))}<div class="mu">${e(u.folio)}</div></td>${c.dias.map(d => `<td class="x" data-f="${u.folio}" data-d="${d}">${a?.dias?.[d] ? 1 : ""}</td>`).join("")}</tr>` }).join("") + "</table>" : '<div class="mu">Sin inscritos en este curso.</div>';
    $$("td.x").forEach(t => t.onclick = async () => { try { await setAsis(t.dataset.f, t.dataset.d, !t.textContent) } catch (x) { msg("#m-asi", "No se guardó: " + x.message) } })
}
async function setAsis(folio, dia, val) {
    const c = curSel(), id = inscId(c.id, folio), a = S.as.find(x => x.id === id), dias = { ...(a?.dias || {}) }; val ? dias[dia] = 1 : delete dias[dia];
    await S.db.doc("asistencias/" + id).set({ curso: c.id, folio, dias })
}
async function mark(folio, via) {
    const c = curSel(), dia = $("#s-dia").value; if (!c || !dia) return msg("#m-asi", "Selecciona curso y día.");
    const u = S.us.find(x => x.folio === folio); if (!u) return msg("#m-asi", "Folio no encontrado: " + folio);
    if (!S.in.some(i => i.curso === c.id && i.folio === folio)) return msg("#m-asi", full(u) + " no está inscrito en este curso.");
    const a = S.as.find(x => x.id === inscId(c.id, folio)); if (a?.dias?.[dia]) return msg("#m-asi", full(u) + " ya tenía asistencia el " + fmt(dia) + ".", 1);
    try { await setAsis(folio, dia, true); msg("#m-asi", "Asistencia registrada: " + full(u) + " (" + fmt(dia) + ")" + via, 1) } catch (x) { msg("#m-asi", "Error: " + (x.message || x.code)) }
}
$("#b-q").onclick = () => {
    const q = $("#s-q").value.trim().toLowerCase(), c = curSel(); $("#s-opts").innerHTML = ""; if (!q || !c) return;
    const us = S.in.filter(i => i.curso === c.id).map(i => S.us.find(u => u.folio === i.folio)).filter(Boolean);
    const m = us.filter(u => u.folio.toLowerCase() === q).concat(us.filter(u => u.folio.toLowerCase() !== q && full(u).toLowerCase().includes(q)));
    if (!m.length) return msg("#m-asi", "Sin coincidencias entre los inscritos de este curso.");
    if (m.length === 1) { mark(m[0].folio, ""); $("#s-q").value = ""; return }
    msg("#m-asi", "Varias coincidencias, elige una:", 1); $("#s-opts").innerHTML = m.map(u => `<div class="row"><span>${e(full(u))} <span class="mu">${e(u.folio)}</span></span><button data-m="${u.folio}">Dar asistencia</button></div>`).join("");
    $$("[data-m]").forEach(b => b.onclick = () => { mark(b.dataset.m, ""); $("#s-opts").innerHTML = ""; $("#s-q").value = "" })
};
$("#s-q").onkeydown = ev => { if (ev.key === "Enter") $("#b-q").click() };

/* camera */
async function startCam() {
    if (!window.jsQR) return msg("#m-asi", "No cargó la librería jsQR. Revisa que index.html apunte al archivo real (src/jsQR.min.js).");
    if (!navigator.mediaDevices?.getUserMedia) return msg("#m-asi", "La cámara solo funciona en HTTPS o en http://localhost. Abre la página desde localhost o usa HTTPS.");
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }) } catch (x) { return msg("#m-asi", "No se pudo abrir la cámara (permiso o entorno). Usa la búsqueda por folio o nombre.") }
    const v = $("#vid"); v.srcObject = stream; await v.play(); v.classList.remove("hide"); $("#b-stop").classList.remove("hide"); scanning = true; msg("#m-asi", "Apunta al QR del usuario…", 1); loop()
}
function stopCam() { scanning = false; stream?.getTracks().forEach(t => t.stop()); stream = null; $("#vid").classList.add("hide"); $("#b-stop").classList.add("hide") }
function loop() {
    if (!scanning) return; const v = $("#vid"), cv = $("#cv"); if (v.readyState >= 2 && window.jsQR) {
        cv.width = v.videoWidth; cv.height = v.videoHeight; const x = cv.getContext("2d", { willReadFrequently: true }); x.drawImage(v, 0, 0);
        const r = jsQR(x.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height); if (r && r.data && (r.data !== lastCode || Date.now() - lastT > 4000)) { lastCode = r.data; lastT = Date.now(); mark(r.data.trim(), " (QR)") }
    } requestAnimationFrame(loop)
}
$("#b-cam").onclick = startCam; $("#b-stop").onclick = stopCam;

function paint() { if (!S.me) return; S.me.rol === "admin" ? paintAdmin() : paintUser() }

/* Conexión con el servidor backend en Node.js y SQLite */
const API_URL = location.protocol === "file:" ? "http://localhost:3000/api" : `${location.protocol}//${location.hostname}:3000/api`;

// SQLite devuelve ids numéricos y JSON como texto: se normaliza todo para que las comparaciones (===) funcionen
const asJson = (v, vacio) => { if (typeof v !== "string") return v ?? vacio; try { return JSON.parse(v) } catch { return vacio } };
function normalizar(d) {
    S.us = (d.usuarios || []).map(u => ({ ...u, id: String(u.id ?? u.folio) }));
    S.cu = (d.cursos || []).map(c => ({ ...c, id: String(c.id), dias: [...asJson(c.dias, [])].sort() }));
    S.in = (d.inscripciones || []).map(i => ({ ...i, id: String(i.id ?? inscId(i.curso, i.folio)), curso: String(i.curso) }));
    S.as = (d.asistencias || []).map(a => {
        let dias = asJson(a.dias, {});
        if (Array.isArray(dias)) dias = Object.fromEntries(dias.map(x => [x, 1]));   // por si llega como lista de fechas
        return { ...a, id: String(a.id ?? inscId(a.curso, a.folio)), curso: String(a.curso), dias };
    });
}

async function cargarDatosServidor() {
    try {
        const res = await fetch(`${API_URL}/data`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        normalizar(await res.json());
        const f = sess();
        if (f) { const u = S.us.find(x => x.folio === f); if (u) S.me = u; }
        show();
    } catch (er) {
        msg("#m-db", "Error al conectar con el servidor Node.js: " + er.message); console.error(er); if (S.me) alert("Error al sincronizar con el servidor: " + er.message);
    }
}

async function peticion(metodo, url, cuerpo) {
    const res = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    if (!res.ok) { const t = await res.json().catch(() => ({})); throw new Error(t.error || "HTTP " + res.status) }
    await cargarDatosServidor();   // el estado local se refresca solo cuando el servidor confirmó
}

// Adaptador: mantiene la sintaxis S.db.doc("col/id").set/update/delete
S.db = {
    collection: (name) => ({
        doc: (id) => ({
            set: (data) => peticion("POST", `${API_URL}/${name}`, { ...data, id }),            // el servidor hace upsert
            update: (data) => peticion("PUT", `${API_URL}/${name}/${encodeURIComponent(id)}`, data),
            delete: () => peticion("DELETE", `${API_URL}/${name}/${encodeURIComponent(id)}`)
        })
    }),
    doc: (path) => { const [name, id] = path.split("/"); return S.db.collection(name).doc(id) }
};

(async () => { await cargarDatosServidor() })();