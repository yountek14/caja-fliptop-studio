/**
 * StudioMockup — Exportador de Mockup 3D de Presentación para Clientes (WhatsApp / Instagram)
 * Captura dos ángulos limpios de la caja armada en 3D (3/4 frontal y costado)
 * sobre un fondo de estudio elegante, en PNG 1600×1000 listo para aprobación.
 */
(function () {
  function exportClientMockup({ renderer, scene, camera, orbit, state, setFoldAndRender, showToast, style = 'dark' }) {
    if (!renderer || !scene || !camera) return;
    if (showToast) showToast('Generando Mockup 3D para cliente...');

    // Guardar estado actual de escena y cámara
    const prevFold = state.fold;
    const prevLid = state.lidOpen;
    const prevTheta = orbit.theta;
    const prevPhi = orbit.phi;
    const prevRadius = orbit.radius;
    const prevTarget = orbit.target.clone();
    const prevBg = scene.background ? scene.background.clone() : null;
    const prevFog = scene.fog;
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);

    const outW = 1600;
    const outH = 1000;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const ctx = outCanvas.getContext('2d');

    // Fondo de presentación
    const grad = ctx.createLinearGradient(0, 0, outW, outH);
    if (style === 'light') {
      grad.addColorStop(0, '#f8f5f0');
      grad.addColorStop(1, '#e7dfd3');
    } else {
      grad.addColorStop(0, '#14161f');
      grad.addColorStop(0.55, '#1d2030');
      grad.addColorStop(1, '#0e1017');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, outW, outH);

    // Render auxiliar a 800×800 por ángulo
    const shotW = 760, shotH = 760;
    renderer.setSize(shotW, shotH, false);
    camera.aspect = shotW / shotH;
    camera.updateProjectionMatrix();

    // Asegurar caja armada y limpia
    state.fold = 1;
    state.lidOpen = 0;
    if (setFoldAndRender) setFoldAndRender();

    const renderAngle = (theta, phi, radius, target, dx, dy) => {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(dx, dy, shotW, shotH, 28);
      ctx.clip();
      ctx.drawImage(renderer.domElement, dx, dy, shotW, shotH);
      ctx.restore();
      ctx.strokeStyle = style === 'light' ? 'rgba(120,100,80,0.18)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(dx, dy, shotW, shotH, 28);
      ctx.stroke();
    };

    const centerTarget = new THREE.Vector3(state.hasPocket ? 12 : 0, 44, 10);
    // Ángulo 1: 3/4 Frontal
    renderAngle(0.45, 1.24, 195, centerTarget, 30, 120);
    // Ángulo 2: Costado / Espalda 3/4 (muestra bolsillo o lateral)
    renderAngle(state.hasPocket ? 1.38 : -0.65, 1.22, 195, centerTarget, 810, 120);

    // Encabezado limpio
    ctx.fillStyle = style === 'light' ? '#1c1917' : '#f4f4f5';
    ctx.font = '700 32px Inter, system-ui, sans-serif';
    ctx.fillText('Vista Previa 3D · Caja Personalizada', 42, 68);
    ctx.fillStyle = style === 'light' ? '#78716c' : '#a1a1aa';
    ctx.font = '500 18px Inter, system-ui, sans-serif';
    const spec = state.hasPocket
      ? 'Flip-Top 55×24×88 mm + Bolsillo BIC J6'
      : 'Flip-Top Clásica 55×24×88 mm';
    ctx.fillText(`${spec}${state.hasWindow ? ' · Con Ventanita' : ''} · Aprobación de Diseño`, 42, 96);

    ctx.fillStyle = style === 'light' ? '#a8a29e' : '#52525b';
    ctx.font = '500 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Caja Flip-Top Studio v3', outW - 42, outH - 28);

    // Restaurar escena original
    state.fold = prevFold;
    state.lidOpen = prevLid;
    if (prevBg) scene.background.copy(prevBg);
    scene.fog = prevFog;
    renderer.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = Math.max(0.1, prevSize.x / Math.max(1, prevSize.y));
    camera.updateProjectionMatrix();
    orbit.theta = prevTheta;
    orbit.phi = prevPhi;
    orbit.radius = prevRadius;
    orbit.target.copy(prevTarget);
    if (setFoldAndRender) setFoldAndRender();

    // Descargar PNG
    const a = document.createElement('a');
    a.href = outCanvas.toDataURL('image/png');
    a.download = `mockup_3d_caja_${Date.now().toString().slice(-5)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (window.StudioAudio) window.StudioAudio.playAction('save');
    if (showToast) showToast('Mockup 3D descargado (listo para WhatsApp)');
  }

  let isRecording360 = false;

  /**
   * Graba un video 360° fluido (~5.5 s) girando la caja armada y abriendo/cerrando la tapa.
   * Descarga un archivo .webm limpio listo para WhatsApp, Instagram Reels o TikTok.
   */
  function record360Video({ renderer, scene, camera, orbit, state, setFoldAndRender, showToast, openLid = true }) {
    if (isRecording360) return;
    if (!renderer || !renderer.domElement || typeof MediaRecorder === 'undefined') {
      if (showToast) showToast('Tu navegador no soporta grabación de video WebM');
      return;
    }

    isRecording360 = true;
    if (showToast) showToast('Grabando video 360° (5.5 s)... no cierres la pestaña');

    const prevFold = state.fold;
    const prevLid = state.lidOpen;
    const prevPlaying = state.isPlaying;
    const prevTheta = orbit.desiredTheta;
    const prevPhi = orbit.desiredPhi;
    const prevRadius = orbit.desiredRadius;
    const prevTarget = orbit.desiredTarget.clone();

    state.isPlaying = false;
    state.fold = 1;
    state.lidOpen = 0;
    if (setFoldAndRender) setFoldAndRender();

    const stream = renderer.domElement.captureStream(30);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm');
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4500000 });
    const chunks = [];

    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caja_fliptop_360_${Date.now().toString().slice(-5)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      // Restaurar estado original
      state.fold = prevFold;
      state.lidOpen = prevLid;
      state.isPlaying = prevPlaying;
      orbit.desiredTheta = prevTheta;
      orbit.desiredPhi = prevPhi;
      orbit.desiredRadius = prevRadius;
      orbit.desiredTarget.copy(prevTarget);
      if (setFoldAndRender) setFoldAndRender();

      isRecording360 = false;
      if (window.StudioAudio) window.StudioAudio.playAction('save');
      if (showToast) showToast('Video 360° descargado (.webm)');
    };

    const startTheta = 0.45;
    const targetPos = new THREE.Vector3(state.hasPocket ? 12 : 0, 44, 10);
    orbit.theta = startTheta;
    orbit.desiredTheta = startTheta;
    orbit.phi = 1.18;
    orbit.desiredPhi = 1.18;
    orbit.radius = 205;
    orbit.desiredRadius = 205;
    orbit.target.copy(targetPos);
    orbit.desiredTarget.copy(targetPos);

    const durationMs = 5500;
    const t0 = performance.now();
    recorder.start();

    function step(now) {
      const p = Math.min(1, (now - t0) / durationMs);
      const angle = startTheta + p * Math.PI * 2;
      orbit.theta = angle;
      orbit.desiredTheta = angle;

      // Abrir tapa suavemente entre 35% y 72% del giro
      if (openLid) {
        if (p > 0.35 && p < 0.72) {
          const lp = (p - 0.35) / 0.37;
          const ease = Math.sin(lp * Math.PI);
          state.lidOpen = Math.round(ease * 85);
        } else {
          state.lidOpen = 0;
        }
        if (setFoldAndRender) setFoldAndRender();
      }

      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(() => recorder.stop(), 120);
      }
    }
    requestAnimationFrame(step);
  }

  window.StudioMockup = { exportClientMockup, record360Video };
})();
