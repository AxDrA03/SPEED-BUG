const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // Almacena temporalmente la imagen en memoria

const app = express();
app.use(express.json());
app.use(cors());

const path = require('path');
app.use(express.static(path.join(__dirname, '../')));
// Conexión a SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error("Error al abrir SQLite:", err.message);
    else console.log("Conectado a la base de datos SQLite.");
});

// Crear tablas iniciales
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        folio TEXT PRIMARY KEY,
        rol TEXT,
        nombre TEXT,
        apellido_paterno TEXT,
        apellido_materno TEXT,
        correo TEXT UNIQUE,
        salt TEXT,
        hash TEXT,
        creado TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cursos (
        id TEXT PRIMARY KEY,
        nombre TEXT,
        descripcion TEXT,
        dias TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inscripciones (
        id TEXT PRIMARY KEY,
        curso TEXT,
        folio TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS asistencias (
        id TEXT PRIMARY KEY,
        curso TEXT,
        folio TEXT,
        dias TEXT
    )`);
});

// --- ENDPOINT DE SINCRONIZACIÓN GENERAL ---
app.get('/api/data', (req, res) => {
    db.all("SELECT * FROM usuarios", [], (err, usuarios) => {
        db.all("SELECT * FROM cursos", [], (err2, cursos) => {
            const formattedCursos = cursos.map(c => ({ ...c, dias: JSON.parse(c.dias || "[]") }));
            db.all("SELECT * FROM inscripciones", [], (err3, inscripciones) => {
                db.all("SELECT * FROM asistencias", [], (err4, asistencias) => {
                    const formattedAsistencias = asistencias.map(a => ({ ...a, dias: JSON.parse(a.dias || "{}") }));
                    res.json({ usuarios, cursos: formattedCursos, inscripciones, asistencias });
                });
            });
        });
    });
});

// --- USUARIOS ---
app.post('/api/usuarios', (req, res) => {
    const { folio, rol, nombre, apellido_paterno, apellido_materno, correo, salt, hash, creado } = req.body;
    const query = `INSERT INTO usuarios (folio, rol, nombre, apellido_paterno, apellido_materno, correo, salt, hash, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [folio, rol, nombre, apellido_paterno, apellido_materno, correo, salt, hash, creado], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/usuarios/:folio', (req, res) => {
    const { salt, hash } = req.body;
    db.run(`UPDATE usuarios SET salt = ?, hash = ? WHERE folio = ?`, [salt, hash, req.params.folio], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- CURSOS ---
app.post('/api/cursos', (req, res) => {
    const { id, nombre, descripcion, dias } = req.body;
    db.run(`INSERT INTO cursos (id, nombre, descripcion, dias) VALUES (?, ?, ?, ?)`, [id, nombre, descripcion, JSON.stringify(dias)], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/cursos/:id', (req, res) => {
    const id = req.params.id;
    db.serialize(() => {
        db.run(`DELETE FROM cursos WHERE id = ?`, [id]);
        db.run(`DELETE FROM inscripciones WHERE curso = ?`, [id]);
        db.run(`DELETE FROM asistencias WHERE curso = ?`, [id], (err) => {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// --- INSCRIPCIONES ---
app.post('/api/inscripciones', (req, res) => {
    const { id, curso, folio } = req.body;
    db.run(`INSERT INTO inscripciones (id, curso, folio) VALUES (?, ?, ?)`, [id, curso, folio], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/inscripciones/:id', (req, res) => {
    db.run(`DELETE FROM inscripciones WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- ASISTENCIAS ---
app.post('/api/asistencias', (req, res) => {
    const { id, curso, folio, dias } = req.body;
    db.run(`INSERT OR REPLACE INTO asistencias (id, curso, folio, dias) VALUES (?, ?, ?, ?)`, 
        [id, curso, folio, JSON.stringify(dias)], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- ENDPOINT QR (Opcional si deseas procesarlo del lado de Node con jsqr) ---
app.post('/scan-qr', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No image provided" });
    }
    // Aquí puedes procesar la imagen con librerías de Node si prefieres no usar el lector del navegador
    res.json({ success: true, message: "Imagen recibida en Node.js" });
});

app.listen(3000, () => {
    console.log("Servidor Node.js corriendo en http://localhost:3000");
});
