(function () {
  var $ = function (i) { return document.getElementById(i); };
  function el(t, p) {
    var e = document.createElement(t);
    for (var k in p || {}) { if (k === 'c') e.className = p[k]; else if (k.slice(0, 2) === 'on') e[k] = p[k]; else e.setAttribute(k, p[k]); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c != null && c !== false) e.append(c); }
    return e;
  }
  var courses = [], students = [], sessionId = null, stream = null, raf = null, busy = false, lastSent = 0, lastKey = '', lastAt = 0;
  var video = $('video'), viewer = $('viewer'), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');

  async function api(path, opt) {
    var r = await fetch(path, opt), j = await r.json().catch(function () { return {}; });
    if (r.status === 401 && !/\/(login|signup)$/.test(path)) { showAuth(); throw new Error('Sesión expirada. Vuelve a entrar.'); }
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  var post = function (p, d) { return api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d || {}) }); };
  var del = function (p) { return api(p, { method: 'DELETE' }); };
  function gmsg(t, err) { $('gmsg').textContent = t || ''; $('gmsg').className = 'msg' + (err ? ' err' : ''); }
  function fail(e) { gmsg(e.message, true); }

  // ---------- acceso ----------
  function showAuth() { stop(); $('app').classList.add('hidden'); $('auth').classList.remove('hidden'); }
  async function enter() {
    var me = await api('/api/admin/me');
    $('auth').classList.add('hidden'); $('app').classList.remove('hidden'); $('who').textContent = me.email; gmsg('');
    await loadAll();
  }
  $('toSignup').onclick = function () { $('loginForm').classList.add('hidden'); $('signupForm').classList.remove('hidden'); $('amsg').textContent = ''; };
  $('toLogin').onclick = function () { $('signupForm').classList.add('hidden'); $('loginForm').classList.remove('hidden'); $('amsg').textContent = ''; };
  $('loginForm').onsubmit = async function (e) {
    e.preventDefault();
    try { await post('/api/admin/login', { email: $('lEmail').value, key: $('lKey').value }); $('lKey').value = ''; $('amsg').textContent = ''; await enter(); }
    catch (err) { $('amsg').textContent = err.message; }
  };
  $('signupForm').onsubmit = async function (e) {
    e.preventDefault();
    if ($('sKey').value !== $('sKey2').value) { $('amsg').textContent = 'Las keys no coinciden.'; return; }
    try {
      await post('/api/admin/signup', { email: $('sEmail').value, key: $('sKey').value, code: $('sCode').value });
      $('sKey').value = $('sKey2').value = $('sCode').value = ''; $('amsg').textContent = ''; await enter();
    } catch (err) { $('amsg').textContent = err.message; }
  };
  $('logout').onclick = async function () { try { await post('/api/admin/logout'); } catch (e) {} showAuth(); };

  $('keyForm').onsubmit = async function (e) {
    e.preventDefault();
    var m = $('kmsg'); m.className = 'msg';
    if ($('kNew').value !== $('kNew2').value) { m.textContent = 'Las keys nuevas no coinciden.'; m.className = 'msg err'; return; }
    try {
      await post('/api/admin/key', { current: $('kOld').value, new: $('kNew').value });
      $('kOld').value = $('kNew').value = $('kNew2').value = ''; m.textContent = 'Key actualizada.';
    } catch (err) { m.textContent = err.message; m.className = 'msg err'; }
  };

  $('tabs').onclick = function (e) {
    var t = e.target.dataset && e.target.dataset.tab; if (!t) return;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b === e.target); });
    ['asistencia', 'cursos', 'alumnos', 'cuenta'].forEach(function (n) { $('t-' + n).classList.toggle('hidden', n !== t); });
    if (t !== 'asistencia') stop();
  };

  // ---------- cursos y alumnos ----------
  async function loadAll() {
    try {
      var r = await Promise.all([api('/api/courses'), api('/api/students')]);
      courses = r[0]; students = r[1]; renderCourses(); renderStudents();
      var sel = $('attCourse'), v = sel.value; sel.textContent = '';
      courses.forEach(function (c) { sel.append(el('option', { value: c.id }, c.name)); });
      if (v) sel.value = v;
      await refreshToday();
    } catch (e) { fail(e); }
  }
  function renderCourses() {
    var ul = $('courseList'); ul.textContent = '';
    courses.forEach(function (c) {
      ul.append(el('li', {}, el('div', { c: 'top' }, el('strong', {}, c.name),
        el('button', { c: 'mini', onclick: async function () {
          if (!confirm('¿Eliminar “' + c.name + '” con todas sus asistencias?')) return;
          try { await del('/api/courses/' + c.id); await loadAll(); } catch (e) { fail(e); }
        } }, 'Eliminar'))));
    });
    if (!courses.length) ul.append(el('li', {}, el('small', {}, 'Aún no hay cursos.')));
  }
  $('addCourse').onclick = async function () {
    try { await post('/api/courses', { name: $('courseName').value }); $('courseName').value = ''; await loadAll(); } catch (e) { fail(e); }
  };
  function renderStudents() {
    var ul = $('studentList'); ul.textContent = '';
    students.forEach(function (s) {
      var chips = el('div', { c: 'chips' });
      courses.forEach(function (c) {
        var on = s.courses.indexOf(c.id) !== -1;
        chips.append(el('button', { c: 'chip' + (on ? ' on' : ''), onclick: async function () {
          try { await post('/api/enroll', { course_id: c.id, student_id: s.id, enrolled: !on }); await loadAll(); } catch (e) { fail(e); }
        } }, c.name));
      });
      ul.append(el('li', {}, el('div', {}, el('strong', {}, s.name), ' ', el('small', {}, s.expediente)), chips,
        el('div', { c: 'row' },
          el('button', { c: 'mini', onclick: async function () {
            if (!confirm('¿Generar un NIP nuevo para ' + s.name + '? El anterior dejará de servir.')) return;
            try { var r = await post('/api/students/' + s.id + '/nip'); nip(s.name, r.nip); } catch (e) { fail(e); }
          } }, 'Nuevo NIP'),
          el('button', { c: 'mini', onclick: async function () {
            if (!confirm('¿Eliminar a ' + s.name + '?')) return;
            try { await del('/api/students/' + s.id); await loadAll(); } catch (e) { fail(e); }
          } }, 'Eliminar'))));
    });
    if (!students.length) ul.append(el('li', {}, el('small', {}, 'Aún no hay alumnos.')));
  }
  function nip(name, n) {
    var b = $('nipBox'); b.textContent = 'NIP de ' + name + ': ' + n + '  (anótalo y entrégaselo; no se vuelve a mostrar)';
    b.classList.remove('hidden'); window.scrollTo(0, 0);
  }
  $('addStudent').onclick = async function () {
    try {
      var r = await post('/api/students', { expediente: $('stExp').value, name: $('stName').value });
      nip($('stName').value, r.nip); $('stExp').value = $('stName').value = ''; await loadAll();
    } catch (e) { fail(e); }
  };

  // ---------- asistencia de hoy ----------
  async function refreshToday() {
    var cid = $('attCourse').value;
    if (!cid) { sessionId = null; $('sessInfo').textContent = 'Primero crea un curso.'; $('startSession').classList.add('hidden'); $('scanCard').classList.add('hidden'); return; }
    var r = await api('/api/today?course_id=' + cid);
    sessionId = r.session_id;
    $('sessInfo').textContent = sessionId ? 'Asistencia de hoy en curso.' : 'Todavía no se inicia la asistencia de hoy para este curso.';
    $('startSession').classList.toggle('hidden', !!sessionId);
    $('scanCard').classList.toggle('hidden', !sessionId);
    if (!sessionId) stop();
    var ul = $('attList'); ul.textContent = ''; var n = 0;
    r.rows.forEach(function (x) {
      if (x.at) n++;
      ul.append(el('li', {}, el('div', { c: 'top' }, el('span', {}, x.name, ' ', el('small', {}, x.expediente)),
        x.at ? el('span', { c: 'present' }, '✓ ' + x.at.slice(11, 16)) : el('small', {}, 'Falta'))));
    });
    $('count').textContent = 'Presentes: ' + n + ' / ' + r.rows.length;
  }
  $('attCourse').onchange = function () { stop(); $('banner').classList.add('hidden'); refreshToday().catch(fail); };
  $('startSession').onclick = async function () {
    try { await post('/api/sessions', { course_id: +$('attCourse').value }); await refreshToday(); } catch (e) { fail(e); }
  };

  function say(t, err) { $('msg').textContent = t || ''; $('msg').className = 'msg' + (err ? ' err' : ''); }
  function beep(ok) {
    try { var a = new AudioContext(), o = a.createOscillator(); o.frequency.value = ok ? 880 : 300; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12); } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate(ok ? 80 : [60, 60, 60]); } catch (e) {} }
  }
  function result(r, force) {
    if (r.status === 'none') return;
    var key = r.name || r.status, now = Date.now();
    if (!force && key === lastKey && now - lastAt < 3000) { lastAt = now; return; }
    lastKey = key; lastAt = now;
    var m = { ok: ['ok', '✓ ' + r.name + ' registrado'], duplicate: ['warn', r.name + ' ya estaba registrado hoy'],
      not_enrolled: ['err', r.name + ' no está inscrito en este curso'], unknown: ['err', 'No se encontró al alumno (QR o expediente no válido)'] }[r.status];
    var b = $('banner'); b.className = 'banner ' + m[0]; b.textContent = m[1]; beep(r.status === 'ok');
    if (r.status === 'ok') refreshToday().catch(fail);
  }
  $('manualForm').onsubmit = async function (e) {
    e.preventDefault();
    var x = $('expIn').value.trim(); if (!x || !sessionId) return;
    try { result(await post('/api/checkin', { session_id: sessionId, expediente: x }), true); $('expIn').value = ''; } catch (err) { fail(err); }
  };

  // ---------- escáner (la lectura la hace Python/OpenCV; solo funciona con sesión de administrador) ----------
  async function tick() {
    if (!stream) return; var now = Date.now();
    if (!busy && now - lastSent >= 150 && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      busy = true; lastSent = now;
      var sc = Math.min(1, 1024 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * sc); canvas.height = Math.round(video.videoHeight * sc);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.85); });
        result(await api('/api/scan?session_id=' + sessionId, { method: 'POST', body: blob }), false);
      } catch (e) { say(e.message, true); }
      busy = false;
    }
    raf = requestAnimationFrame(tick);
  }
  async function start() {
    if (!sessionId) return say('Inicia primero la asistencia de hoy.', true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return say('Este navegador no permite usar la cámara (se necesita HTTPS).', true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream; await video.play();
      viewer.classList.add('on'); $('toggle').textContent = 'Detener cámara'; say('Escaneando…'); busy = false; raf = requestAnimationFrame(tick);
    } catch (e) { stream = null; say('No se pudo iniciar la cámara. Revisa el permiso.', true); }
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; video.srcObject = null; viewer.classList.remove('on'); $('toggle').textContent = 'Iniciar cámara'; say('');
  }
  $('toggle').onclick = function () { stream ? stop() : start(); };
  document.addEventListener('visibilitychange', function () { if (document.hidden && stream) stop(); });

  enter().catch(function () {});
})();
