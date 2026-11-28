/**
 * StudioAudio — Motor de Audio Háptico y Dinámico (Web Audio API)
 * Sintetiza "dots" repetitivos con pitch ligado al tamaño al escalar imágenes,
 * ticks de snap magnético, rotación y micro-sonidos de UI sin archivos externos.
 */
(function () {
  let ctx = null;
  let enabled = localStorage.getItem('fliptop-audio') !== 'false';
  let lastScaleValue = null;
  let lastScaleTime = 0;
  let lastRotValue = null;
  let lastRotTime = 0;

  function ensureContext() {
    if (!enabled) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  /**
   * Dispara un pulso corto tipo "dot" con frecuencia y envolvente limpia.
   */
  function playDotTone(freq, durationMs = 20, gainPeak = 0.085, wave = 'sine') {
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime;
    const dur = durationMs / 1000;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);
    // Leve micro-caída para que suene orgánico y táctil como un "dot"
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.92), now + dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.005);
  }

  /**
   * Feedback dinámico al agrandar o achicar una imagen/sticker/texto.
   * @param {number} value - Valor actual de escala (ej. 3..300)
   * @param {number} minVal - Mínimo del rango
   * @param {number} maxVal - Máximo del rango
   * @param {number} stepThreshold - Cambio mínimo para disparar el siguiente "dot"
   */
  function onScaleChange(value, minVal = 5, maxVal = 300, stepThreshold = 3) {
    if (!enabled) return;
    const now = performance.now();
    if (lastScaleValue === null) {
      lastScaleValue = value;
      return;
    }
    const delta = value - lastScaleValue;
    if (Math.abs(delta) < stepThreshold) return;
    // Evitar saturación si el usuario mueve rapidísimo (> 35 dots/seg)
    if (now - lastScaleTime < 28) return;

    const growing = delta > 0;
    lastScaleValue = value;
    lastScaleTime = now;

    // Mapeo logarítmico suave: 240 Hz (pequeño) -> 920 Hz (grande)
    const norm = Math.max(0, Math.min(1, (value - minVal) / Math.max(1, maxVal - minVal)));
    const baseFreq = 240 * Math.pow(920 / 240, norm);
    // Pequeño matiz direccional: ligeramente más brillante al subir, más cálido al bajar
    const freq = growing ? baseFreq * 1.04 : baseFreq * 0.96;

    playDotTone(freq, 22, 0.085, growing ? 'triangle' : 'sine');
  }

  function resetScaleTracker(initialVal = null) {
    lastScaleValue = initialVal;
  }

  /**
   * Feedback sutil al rotar una capa.
   */
  function onRotateChange(deg, stepDeg = 6) {
    if (!enabled) return;
    const now = performance.now();
    if (lastRotValue === null) {
      lastRotValue = deg;
      return;
    }
    if (Math.abs(deg - lastRotValue) < stepDeg) return;
    if (now - lastRotTime < 32) return;

    lastRotValue = deg;
    lastRotTime = now;

    const norm = ((((deg % 360) + 360) % 360) / 360);
    const freq = 380 + norm * 240;
    playDotTone(freq, 15, 0.05, 'sine');
  }

  function resetRotateTracker(initialDeg = null) {
    lastRotValue = initialDeg;
  }

  /**
   * Tick cristalino cuando una capa hace snap al centro o a 0°/90°/180°.
   */
  function playSnap() {
    if (!enabled) return;
    playDotTone(1240, 16, 0.075, 'sine');
  }

  /**
   * Micro-sonidos de acciones de interfaz.
   */
  function playAction(type) {
    if (!enabled) return;
    if (type === 'add') {
      playDotTone(520, 26, 0.07, 'triangle');
      setTimeout(() => playDotTone(760, 28, 0.06, 'sine'), 32);
    } else if (type === 'delete') {
      playDotTone(320, 28, 0.07, 'sine');
      setTimeout(() => playDotTone(210, 32, 0.055, 'sine'), 30);
    } else if (type === 'save') {
      playDotTone(523.25, 35, 0.06, 'sine');
      setTimeout(() => playDotTone(659.25, 35, 0.06, 'sine'), 45);
      setTimeout(() => playDotTone(783.99, 55, 0.065, 'sine'), 90);
    } else if (type === 'undo') {
      playDotTone(440, 20, 0.055, 'sine');
      setTimeout(() => playDotTone(350, 22, 0.05, 'sine'), 26);
    } else if (type === 'redo') {
      playDotTone(350, 20, 0.055, 'sine');
      setTimeout(() => playDotTone(440, 22, 0.05, 'sine'), 26);
    } else if (type === 'click') {
      playDotTone(640, 14, 0.045, 'sine');
    }
  }

  function setEnabled(val) {
    enabled = !!val;
    localStorage.setItem('fliptop-audio', enabled ? 'true' : 'false');
    if (enabled) playAction('click');
  }

  function isEnabled() {
    return enabled;
  }

  window.StudioAudio = {
    onScaleChange,
    resetScaleTracker,
    onRotateChange,
    resetRotateTracker,
    playSnap,
    playAction,
    setEnabled,
    isEnabled
  };
})();
