#!/usr/bin/env python3
"""Sistema de asistencia con QR: alumnos (index.html) y administradores (/admin).
Uso: python server.py [puerto]"""
import hashlib, hmac, json, os, re, secrets, sqlite3, sys, threading, time
from datetime import datetime
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np

from qr_reader import make_detector, read_qr

ROOT = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(ROOT, "asistencia.db")
CODE_FILE = os.path.join(ROOT, ".codigo_registro")
MAX = 10 * 1024 * 1024
STATIC = {"/": "index.html", "/index.html": "index.html", "/admin": "admin.html", "/admin.html": "admin.html",
          "/usuario.js": "usuario.js", "/admin.js": "admin.js", "/styles.css": "styles.css"}
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,200}\.[^@\s]{2,}$")
EXPE = re.compile(r"^[A-Z0-9-]{3,20}$")
COOKIE = {"admin": "asid", "student": "usid"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, expediente TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments(course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE, PRIMARY KEY(course_id, student_id));
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date TEXT NOT NULL, UNIQUE(course_id, date));
CREATE TABLE IF NOT EXISTS attendance(session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE, at TEXT NOT NULL, admin_id INTEGER, method TEXT,
  PRIMARY KEY(session_id, student_id));
"""
DETECTOR, LOCK = make_detector(), threading.Lock()
AUTH, FAILS = {}, {}


# ---------- base de datos ----------
def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def rows(sql, a=()):
    c = conn()
    try:
        return [dict(r) for r in c.execute(sql, a).fetchall()]
    finally:
        c.close()


def execute(sql, a=()):
    c = conn()
    try:
        cur = c.execute(sql, a)
        c.commit()
        return cur.lastrowid, cur.rowcount
    finally:
        c.close()


# ---------- claves ----------
def kdf(secret, salt):
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), bytes.fromhex(salt), 200_000).hex()


def make_hash(secret):
    salt = secrets.token_hex(16)
    return salt, kdf(secret, salt)


def verify(secret, salt, h):
    return hmac.compare_digest(kdf(secret, salt), h)


def locked(k):  # 5 fallos = 5 minutos bloqueado
    n, t = FAILS.get(k, (0, 0))
    if n >= 5 and t <= time.time():
        FAILS.pop(k, None)
        return False
    return n >= 5


def fail(k):
    FAILS[k] = (FAILS.get(k, (0, 0))[0] + 1, time.time() + 300)


def signup_code():
    c = os.environ.get("ADMIN_SIGNUP_CODE")
    if c:
        return c
    if os.path.exists(CODE_FILE):
        return open(CODE_FILE).read().strip()
    c = secrets.token_urlsafe(8)
    with open(CODE_FILE, "w") as f:
        f.write(c)
    os.chmod(CODE_FILE, 0o600)
    return c


SIGNUP = signup_code()
hoy = lambda: datetime.now().strftime("%Y-%m-%d")
ahora = lambda: datetime.now().isoformat(timespec="seconds")


def mark(session_id, st, admin_id, method):
    if not rows("SELECT 1 FROM sessions x JOIN enrollments e ON e.course_id=x.course_id "
                "WHERE x.id=? AND e.student_id=?", (session_id, st["id"])):
        return {"status": "not_enrolled", "name": st["name"]}
    n = execute("INSERT OR IGNORE INTO attendance VALUES(?,?,?,?,?)",
                (session_id, st["id"], ahora(), admin_id, method))[1]
    return {"status": "ok" if n else "duplicate", "name": st["name"]}


class H(SimpleHTTPRequestHandler):
    def __init__(s, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(s, f, *a):
        if "/api/scan" not in s.requestline:
            super().log_message(f, *a)

    def end_headers(s):
        s.send_header("X-Content-Type-Options", "nosniff")
        if s.command == "GET" and not s.path.startswith("/api"):
            s.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def out(s, code, obj, headers=()):
        b = json.dumps(obj).encode()
        s.send_response(code)
        s.send_header("Content-Type", "application/json; charset=utf-8")
        s.send_header("Content-Length", str(len(b)))
        s.send_header("Cache-Control", "no-store")
        for k, v in headers:
            s.send_header(k, v)
        s.end_headers()
        s.wfile.write(b)

    def body(s):
        n = int(s.headers.get("Content-Length", 0))
        if n > MAX:
            raise ValueError("Cuerpo demasiado grande")
        return s.rfile.read(n)

    def sid(s, role):
        m = SimpleCookie(s.headers.get("Cookie", "")).get(COOKIE[role])
        return m.value if m else None

    def uid(s, role):
        a = AUTH.get(s.sid(role))
        return a[1] if a and a[0] == role and a[2] > time.time() else None

    def login(s, role, uid):
        sid = secrets.token_urlsafe(24)
        AUTH[sid] = (role, uid, time.time() + 8 * 3600)
        ck = f"{COOKIE[role]}={sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800"
        if s.headers.get("X-Forwarded-Proto") == "https":
            ck += "; Secure"
        return s.out(200, {"ok": True}, [("Set-Cookie", ck)])

    def logout(s, role):
        AUTH.pop(s.sid(role), None)
        return s.out(200, {"ok": True}, [("Set-Cookie", f"{COOKIE[role]}=; Max-Age=0; Path=/")])

    def do_GET(s):
        p = urlparse(s.path).path
        if p.startswith("/api/"):
            return s.api("GET")
        if p in STATIC:
            s.path = "/" + STATIC[p]
            return super().do_GET()
        s.send_error(404)

    def do_POST(s):
        s.api("POST")

    def do_DELETE(s):
        s.api("DELETE")

    def api(s, method):
        u = urlparse(s.path)
        p, q = u.path, parse_qs(u.query)
        try:
            j = lambda: json.loads(s.body() or b"{}")
            txt = lambda d, k, n=100: str(d.get(k, "")).strip()[:n]

            # ================= acceso =================
            if method == "POST" and p == "/api/admin/signup":
                d = j()
                time.sleep(0.4)
                if locked("signup"):
                    return s.out(429, {"error": "Demasiados intentos. Espera unos minutos."})
                if not hmac.compare_digest(txt(d, "code").encode(), SIGNUP.encode()):
                    fail("signup")
                    return s.out(403, {"error": "Código de registro incorrecto"})
                email, key = txt(d, "email", 254).lower(), str(d.get("key", ""))
                if not EMAIL.match(email):
                    return s.out(400, {"error": "Correo no válido"})
                if len(key) < 6:
                    return s.out(400, {"error": "La key debe tener al menos 6 caracteres"})
                salt, h = make_hash(key)
                return s.login("admin", execute("INSERT INTO admins(email,salt,hash) VALUES(?,?,?)", (email, salt, h))[0])

            if method == "POST" and p == "/api/admin/login":
                d = j()
                email = txt(d, "email", 254).lower()
                k = "a:" + email
                if locked(k):
                    return s.out(429, {"error": "Demasiados intentos. Espera unos minutos."})
                time.sleep(0.4)
                r = rows("SELECT id,salt,hash FROM admins WHERE email=?", (email,))
                if not r or not verify(str(d.get("key", "")), r[0]["salt"], r[0]["hash"]):
                    fail(k)
                    return s.out(401, {"error": "Correo o key incorrectos"})
                FAILS.pop(k, None)
                return s.login("admin", r[0]["id"])

            if method == "POST" and p == "/api/student/login":
                d = j()
                exp = txt(d, "expediente", 20).upper()
                k = "s:" + exp
                if locked(k):
                    return s.out(429, {"error": "Demasiados intentos. Espera unos minutos."})
                time.sleep(0.4)
                r = rows("SELECT id,salt,hash FROM students WHERE expediente=?", (exp,))
                if not r or not verify(str(d.get("nip", "")), r[0]["salt"], r[0]["hash"]):
                    fail(k)
                    return s.out(401, {"error": "Expediente o NIP incorrectos"})
                FAILS.pop(k, None)
                return s.login("student", r[0]["id"])

            if method == "POST" and p == "/api/admin/logout":
                return s.logout("admin")
            if method == "POST" and p == "/api/student/logout":
                return s.logout("student")

            # ================= alumno =================
            if p.startswith("/api/student/"):
                me = s.uid("student")
                if not me:
                    return s.out(401, {"error": "Inicia sesión"})
                st = rows("SELECT expediente,name,token FROM students WHERE id=?", (me,))[0]
                if p == "/api/student/me" and method == "GET":
                    cs = rows("SELECT c.id,c.name,"
                              "(SELECT COUNT(*) FROM sessions x WHERE x.course_id=c.id) total,"
                              "(SELECT COUNT(*) FROM attendance a JOIN sessions x ON x.id=a.session_id "
                              " WHERE x.course_id=c.id AND a.student_id=?) asist "
                              "FROM enrollments e JOIN courses c ON c.id=e.course_id "
                              "WHERE e.student_id=? ORDER BY c.name", (me, me))
                    for c in cs:
                        c["faltas"] = c["total"] - c["asist"]
                    return s.out(200, {"expediente": st["expediente"], "name": st["name"], "courses": cs})
                if p == "/api/student/qr.png" and method == "GET":
                    img = cv2.QRCodeEncoder.create().encode(st["token"])
                    img = cv2.resize(img, None, fx=8, fy=8, interpolation=cv2.INTER_NEAREST)
                    img = cv2.copyMakeBorder(img, 32, 32, 32, 32, cv2.BORDER_CONSTANT, value=255)
                    data = cv2.imencode(".png", img)[1].tobytes()
                    s.send_response(200)
                    s.send_header("Content-Type", "image/png")
                    s.send_header("Content-Length", str(len(data)))
                    s.send_header("Cache-Control", "no-store")
                    s.end_headers()
                    s.wfile.write(data)
                    return
                return s.out(404, {"error": "No encontrado"})

            # ================= administrador =================
            aid = s.uid("admin")
            if not aid:
                return s.out(401, {"error": "No autorizado"})

            if p == "/api/admin/me" and method == "GET":
                return s.out(200, {"email": rows("SELECT email FROM admins WHERE id=?", (aid,))[0]["email"]})

            if p == "/api/admin/key" and method == "POST":
                d = j()
                r = rows("SELECT salt,hash FROM admins WHERE id=?", (aid,))[0]
                new = str(d.get("new", ""))
                time.sleep(0.4)
                if not verify(str(d.get("current", "")), r["salt"], r["hash"]):
                    return s.out(403, {"error": "La key actual no es correcta"})
                if len(new) < 6:
                    return s.out(400, {"error": "La key nueva debe tener al menos 6 caracteres"})
                salt, h = make_hash(new)
                execute("UPDATE admins SET salt=?,hash=? WHERE id=?", (salt, h, aid))
                mine = s.sid("admin")
                for k in [k for k, v in AUTH.items() if v[0] == "admin" and v[1] == aid and k != mine]:
                    AUTH.pop(k, None)  # cierra las demás sesiones de este admin
                return s.out(200, {"ok": True})

            if p == "/api/courses":
                if method == "GET":
                    return s.out(200, rows("SELECT id,name FROM courses ORDER BY name"))
                n = txt(j(), "name")
                if not n:
                    return s.out(400, {"error": "Escribe un nombre"})
                return s.out(200, {"id": execute("INSERT INTO courses(name) VALUES(?)", (n,))[0]})
            m = re.fullmatch(r"/api/courses/(\d+)", p)
            if m and method == "DELETE":
                execute("DELETE FROM courses WHERE id=?", (m[1],))
                return s.out(200, {"ok": True})

            if p == "/api/students":
                if method == "GET":
                    st = rows("SELECT id,expediente,name FROM students ORDER BY name")
                    en = rows("SELECT course_id,student_id FROM enrollments")
                    for x in st:
                        x["courses"] = [e["course_id"] for e in en if e["student_id"] == x["id"]]
                    return s.out(200, st)
                d = j()
                exp, name = txt(d, "expediente", 20).upper(), txt(d, "name")
                if not EXPE.match(exp) or not name:
                    return s.out(400, {"error": "Expediente (3-20 letras, números o guiones) y nombre son obligatorios"})
                nip = "%06d" % secrets.randbelow(10 ** 6)
                salt, h = make_hash(nip)
                execute("INSERT INTO students(expediente,name,token,salt,hash) VALUES(?,?,?,?,?)",
                        (exp, name, secrets.token_urlsafe(12), salt, h))
                return s.out(200, {"nip": nip})
            m = re.fullmatch(r"/api/students/(\d+)(/nip)?", p)
            if m and method == "DELETE" and not m[2]:
                execute("DELETE FROM students WHERE id=?", (m[1],))
                return s.out(200, {"ok": True})
            if m and method == "POST" and m[2]:
                nip = "%06d" % secrets.randbelow(10 ** 6)
                salt, h = make_hash(nip)
                execute("UPDATE students SET salt=?,hash=? WHERE id=?", (salt, h, m[1]))
                FAILS.pop("s:" + (rows("SELECT expediente FROM students WHERE id=?", (m[1],)) or [{"expediente": ""}])[0]["expediente"], None)
                return s.out(200, {"nip": nip})

            if p == "/api/enroll" and method == "POST":
                d = j()
                a = (int(d["course_id"]), int(d["student_id"]))
                if d.get("enrolled"):
                    execute("INSERT OR IGNORE INTO enrollments VALUES(?,?)", a)
                else:
                    execute("DELETE FROM enrollments WHERE course_id=? AND student_id=?", a)
                return s.out(200, {"ok": True})

            # ---- asistencia del día ----
            if p == "/api/sessions" and method == "POST":
                cid = int(j()["course_id"])
                execute("INSERT OR IGNORE INTO sessions(course_id,date) VALUES(?,?)", (cid, hoy()))
                return s.out(200, {"ok": True})

            if p == "/api/today" and method == "GET":
                cid = int(q.get("course_id", ["0"])[0])
                x = rows("SELECT id FROM sessions WHERE course_id=? AND date=?", (cid, hoy()))
                if not x:
                    return s.out(200, {"session_id": None, "rows": []})
                return s.out(200, {"session_id": x[0]["id"], "rows": rows(
                    "SELECT st.expediente,st.name,a.at FROM enrollments e JOIN students st ON st.id=e.student_id "
                    "LEFT JOIN attendance a ON a.session_id=? AND a.student_id=st.id "
                    "WHERE e.course_id=? ORDER BY st.name", (x[0]["id"], cid))})

            if p == "/api/scan" and method == "POST":  # solo administradores leen QR
                sid = int(q.get("session_id", ["0"])[0])
                frame = cv2.imdecode(np.frombuffer(s.body(), np.uint8), cv2.IMREAD_COLOR)
                if frame is None:
                    return s.out(400, {"error": "Imagen no válida"})
                with LOCK:
                    tok, _ = read_qr(DETECTOR, frame)
                if not tok:
                    return s.out(200, {"status": "none"})
                st = rows("SELECT id,name FROM students WHERE token=?", (tok,))
                if not st:
                    return s.out(200, {"status": "unknown"})
                return s.out(200, mark(sid, st[0], aid, "qr"))

            if p == "/api/checkin" and method == "POST":  # expediente a mano
                d = j()
                st = rows("SELECT id,name FROM students WHERE expediente=?", (txt(d, "expediente", 20).upper(),))
                if not st:
                    return s.out(200, {"status": "unknown"})
                return s.out(200, mark(int(d["session_id"]), st[0], aid, "manual"))

            s.out(404, {"error": "No encontrado"})
        except sqlite3.IntegrityError:
            s.out(409, {"error": "Ya existe un registro con esos datos"})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            s.out(400, {"error": "Solicitud inválida"})
        except Exception as e:
            print("Error:", repr(e), file=sys.stderr)
            s.out(500, {"error": "Error del servidor"})


if __name__ == "__main__":
    c = conn()
    c.executescript(SCHEMA)
    c.close()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    srv = ThreadingHTTPServer(("0.0.0.0", port), H)
    print(f"\nAlumnos:        http://localhost:{port}/")
    print(f"Administradores: http://localhost:{port}/admin")
    print(f"Código para registrar administradores: {SIGNUP}\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
