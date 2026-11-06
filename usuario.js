(function () {
  var $ = function (i) { return document.getElementById(i); };
  function el(t, p) {
    var e = document.createElement(t);
    for (var k in p || {}) { if (k === 'c') e.className = p[k]; else e.setAttribute(k, p[k]); }
    for (var i = 2; i < arguments.length; i++) e.append(arguments[i]);
    return e;
  }
  async function api(path, opt) {
    var r = await fetch(path, opt), j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    return j;
  }
  function showLogin() { $('panel').classList.add('hidden'); $('login').classList.remove('hidden'); }

  async function loadPanel() {
    var d = await api('/api/student/me');
    $('login').classList.add('hidden'); $('panel').classList.remove('hidden');
    $('who').textContent = d.name;
    $('expLabel').textContent = 'Expediente: ' + d.expediente;
    $('qrImg').src = '/api/student/qr.png?' + Date.now();
    var t = $('tbl'); t.textContent = '';
    if (!d.courses.length) { $('empty').textContent = 'Aún no estás inscrito en ningún curso.'; return; }
    $('empty').textContent = '';
    t.append(el('tr', {}, el('th', {}, 'Curso'), el('th', {}, 'Clases'), el('th', {}, 'Asistencias'), el('th', {}, 'Faltas')));
    d.courses.forEach(function (c) {
      t.append(el('tr', {}, el('td', {}, c.name), el('td', {}, String(c.total)), el('td', {}, String(c.asist)),
        el('td', { c: c.faltas > 0 ? 'bad' : '' }, String(c.faltas))));
    });
  }

  $('loginForm').onsubmit = async function (e) {
    e.preventDefault();
    try {
      await api('/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expediente: $('exp').value, nip: $('nip').value }) });
      $('nip').value = ''; $('lmsg').textContent = ''; await loadPanel();
    } catch (err) { $('lmsg').textContent = err.message; }
  };
  $('qrBtn').onclick = function () {
    var on = $('qrBox').classList.toggle('on');
    $('qrBtn').textContent = on ? 'Ocultar mi QR' : 'Mostrar mi QR';
  };
  $('printBtn').onclick = function () { window.print(); };
  $('logout').onclick = async function () {
    try { await api('/api/student/logout', { method: 'POST' }); } catch (e) {}
    $('qrBox').classList.remove('on'); showLogin();
  };
  loadPanel().catch(showLogin);
})();
