(function () {
  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), viewer = $('viewer'), msg = $('msg'), toggle = $('toggle');
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var stream = null, raf = null, last = '', history = [], busy = false, lastSent = 0;
  var SEND_EVERY_MS = 150; // mínimo entre fotogramas enviados al servidor

  function say(text, err) {
    msg.textContent = text || '';
    msg.className = 'msg' + (err ? ' err' : '');
  }

  function show(text) {
    $('resCard').classList.remove('hidden');
    var box = $('result');
    box.textContent = '';
    if (/^https?:\/\//i.test(text)) {
      var a = document.createElement('a');
      a.href = text;
      a.textContent = text;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      box.appendChild(a);
      $('open').href = text;
      $('open').classList.remove('hidden');
    } else {
      box.textContent = text;
      $('open').classList.add('hidden');
    }
    if (history[0] !== text) {
      history.unshift(text);
      history = history.slice(0, 10);
      renderHist();
    }
    if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
  }

  function renderHist() {
    var ul = $('hist');
    ul.textContent = '';
    history.forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      li.onclick = function () { show(t); };
      ul.appendChild(li);
    });
    $('histCard').classList.toggle('hidden', !history.length);
  }

  // Envía el canvas al servidor Python (OpenCV) y devuelve el texto del QR o null
  async function decodeOnServer() {
    var blob = await new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (!blob) return null;
    var resp = await fetch('/decode', { method: 'POST', body: blob });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var json = await resp.json();
    return json.data || null;
  }

  async function tick() {
    if (!stream) return;
    var now = Date.now();
    if (!busy && now - lastSent >= SEND_EVERY_MS &&
        video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      busy = true;
      lastSent = now;
      var scale = Math.min(1, 1024 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        var text = await decodeOnServer();
        if (text && text !== last) {
          last = text;
          show(text);
          say('¡Código leído!');
        }
      } catch (e) {
        say('No hay conexión con el servidor Python. ¿Sigue corriendo server.py?', true);
      }
      busy = false;
    }
    raf = requestAnimationFrame(tick);
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      say('Tu navegador no permite acceder a la cámara. Usa “Subir imagen”.', true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      try {
        var track = stream.getVideoTracks()[0];
        var caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        }
      } catch (e) {}
      video.srcObject = stream;
      await video.play();
      viewer.classList.add('on');
      toggle.textContent = 'Detener cámara';
      say('Buscando código QR…');
      last = '';
      busy = false;
      raf = requestAnimationFrame(tick);
    } catch (e) {
      stream = null;
      say(e && e.name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Actívalo en el navegador o usa “Subir imagen”.'
        : 'No se pudo iniciar la cámara. Usa “Subir imagen”.', true);
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    video.srcObject = null;
    viewer.classList.remove('on');
    toggle.textContent = 'Iniciar cámara';
    say('');
  }

  toggle.onclick = function () { stream ? stop() : start(); };
  $('fileBtn').onclick = function () { $('file').click(); };

  $('file').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = async function () {
      var s = Math.min(1, 1600 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * s);
      canvas.height = Math.round(img.height * s);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        var text = await decodeOnServer();
        if (text) { show(text); say('¡Código leído!'); }
        else say('No se encontró ningún código QR en la imagen.', true);
      } catch (err) {
        say('No hay conexión con el servidor Python. ¿Sigue corriendo server.py?', true);
      }
      URL.revokeObjectURL(url);
      e.target.value = '';
    };
    img.onerror = function () {
      say('No se pudo abrir la imagen.', true);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  $('copy').onclick = async function () {
    var t = history[0] || $('result').textContent;
    try {
      await navigator.clipboard.writeText(t);
      say('Copiado al portapapeles.');
    } catch (e) {
      var r = document.createRange();
      r.selectNodeContents($('result'));
      var s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      say('Selecciona y copia el texto manualmente.');
    }
  };

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && stream) stop();
  });
})();