/**
 * StudioColorWheel — Rueda de Color RGB/HSV interactiva en Canvas
 * Permite elegir cualquier tono en el anillo exterior (360°) y luminosidad/saturación
 * en el panel central, sincronizando el color activo para "Pintar Toda la Caja" y
 * el "Balde de Pintura 3D".
 */
(function () {
  let currentHex = '#1a242e';
  let hue = 210;   // 0..360
  let sat = 0.43;  // 0..1
  let val = 0.18;  // 0..1
  const listeners = new Set();

  function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [
      Math.round((r + m) * 255),
      Math.round((g + m) * 255),
      Math.round((b + m) * 255)
    ];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  }

  function hexToHsv(hex) {
    const clean = (hex || '#1a242e').replace('#', '');
    if (clean.length !== 6) return { h: 210, s: 0.43, v: 0.18 };
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
  }

  function notify() {
    listeners.forEach(fn => { try { fn(currentHex); } catch (e) {} });
  }

  function setColor(hex, silent = false) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    currentHex = hex.toLowerCase();
    const hsv = hexToHsv(currentHex);
    hue = hsv.h;
    sat = hsv.s;
    val = hsv.v;
    drawWheel();
    syncInputs();
    if (!silent) notify();
  }

  function getColor() {
    return currentHex;
  }

  function onChange(fn) {
    listeners.add(fn);
  }

  let canvasEl = null;
  let dragMode = null; // 'ring' | 'box' | null

  function getMetrics(size) {
    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * 0.47;
    const innerR = size * 0.35;
    const boxHalf = innerR * 0.66;
    return { cx, cy, outerR, innerR, boxHalf, boxSize: boxHalf * 2 };
  }

  function drawWheel() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    const size = canvasEl.width;
    const { cx, cy, outerR, innerR, boxHalf, boxSize } = getMetrics(size);

    ctx.clearRect(0, 0, size, size);

    // 1. Anillo RGB de 360°
    for (let deg = 0; deg < 360; deg += 1) {
      const a0 = ((deg - 1) * Math.PI) / 180;
      const a1 = ((deg + 1) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, (outerR + innerR) / 2, a0, a1);
      ctx.strokeStyle = `hsl(${deg}, 100%, 50%)`;
      ctx.lineWidth = outerR - innerR;
      ctx.stroke();
    }

    // Indicador de tono en el anillo
    const hRad = (hue * Math.PI) / 180;
    const midR = (outerR + innerR) / 2;
    const hx = cx + Math.cos(hRad) * midR;
    const hy = cy + Math.sin(hRad) * midR;
    ctx.beginPath();
    ctx.arc(hx, hy, (outerR - innerR) * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 2. Cuadrado interior Saturación / Brillo
    const bx = cx - boxHalf;
    const by = cy - boxHalf;
    const [hr, hg, hb] = hsvToRgb(hue, 1, 1);

    ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
    ctx.fillRect(bx, by, boxSize, boxSize);

    const gradWhite = ctx.createLinearGradient(bx, by, bx + boxSize, by);
    gradWhite.addColorStop(0, '#ffffff');
    gradWhite.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradWhite;
    ctx.fillRect(bx, by, boxSize, boxSize);

    const gradBlack = ctx.createLinearGradient(bx, by, bx, by + boxSize);
    gradBlack.addColorStop(0, 'rgba(0,0,0,0)');
    gradBlack.addColorStop(1, '#000000');
    ctx.fillStyle = gradBlack;
    ctx.fillRect(bx, by, boxSize, boxSize);

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, boxSize, boxSize);

    // Indicador SV dentro del cuadrado
    const sx = bx + sat * boxSize;
    const sy = by + (1 - val) * boxSize;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = currentHex;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  function syncInputs() {
    document.documentElement.style.setProperty('--bucket-color', currentHex);
    const hexLbl = document.getElementById('rgb-wheel-hex');
    const preview = document.getElementById('rgb-wheel-preview');
    const rblxSwatch = document.getElementById('rblx-bucket-color');
    const bgColorInp = document.getElementById('drawer-bg-color');
    if (hexLbl) hexLbl.value = currentHex.toUpperCase();
    if (preview) preview.style.backgroundColor = currentHex;
    if (rblxSwatch) rblxSwatch.value = currentHex;
    if (bgColorInp) bgColorInp.value = currentHex;
  }

  function updateFromPointer(clientX, clientY, isStart) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const scale = canvasEl.width / Math.max(1, rect.width);
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;
    const { cx, cy, outerR, innerR, boxHalf, boxSize } = getMetrics(canvasEl.width);

    if (isStart) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= innerR - 4 && dist <= outerR + 6) dragMode = 'ring';
      else if (Math.abs(x - cx) <= boxHalf + 6 && Math.abs(y - cy) <= boxHalf + 6) dragMode = 'box';
      else return;
    }

    if (dragMode === 'ring') {
      let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      hue = deg;
    } else if (dragMode === 'box') {
      sat = Math.max(0, Math.min(1, (x - (cx - boxHalf)) / boxSize));
      val = Math.max(0, Math.min(1, 1 - (y - (cy - boxHalf)) / boxSize));
    } else {
      return;
    }

    const [r, g, b] = hsvToRgb(hue, sat, val);
    currentHex = rgbToHex(r, g, b);
    drawWheel();
    syncInputs();
    notify();
  }

  function init(canvasId = 'rgb-wheel-canvas') {
    canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;
    drawWheel();
    syncInputs();

    canvasEl.addEventListener('mousedown', e => {
      e.preventDefault();
      updateFromPointer(e.clientX, e.clientY, true);
    });
    window.addEventListener('mousemove', e => {
      if (!dragMode) return;
      updateFromPointer(e.clientX, e.clientY, false);
    });
    window.addEventListener('mouseup', () => { dragMode = null; });

    const hexInp = document.getElementById('rgb-wheel-hex');
    if (hexInp) {
      hexInp.onchange = e => {
        let v = e.target.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) setColor(v);
        else syncInputs();
      };
    }

    const rblxSwatch = document.getElementById('rblx-bucket-color');
    if (rblxSwatch) {
      rblxSwatch.oninput = e => setColor(e.target.value);
    }

    // Botón Gotero (EyeDropper API nativa de Chrome/Edge)
    const eyeBtn = document.getElementById('rgb-eyedropper-btn');
    if (eyeBtn) {
      eyeBtn.onclick = async () => {
        if ('EyeDropper' in window) {
          try {
            const ed = new window.EyeDropper();
            const res = await ed.open();
            if (res && res.sRGBHex) {
              setColor(res.sRGBHex);
              if (window.StudioAudio) window.StudioAudio.playSnap();
            }
          } catch (e) { /* usuario canceló con Esc */ }
        } else {
          // Fallback: abrir selector de color nativo
          if (rblxSwatch) rblxSwatch.click();
        }
      };
    }
  }

  window.StudioColorWheel = {
    init,
    setColor,
    getColor,
    onChange
  };
})();
