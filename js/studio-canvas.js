/**
 * StudioCanvas — Lienzo 2D Profesional para el Modo Estudio de Diseño
 * Soporta 3 sub-modos:
 *  - 'focus': Cara única ampliada con handles directos (escala con sonido dinámico, rotación, snap magnético)
 *  - 'continuous': Frente Continuo (front + lidFront unidos 55×88 mm) con guía de corte de tapa
 *  - 'diecut': Troquel completo interactivo (delegado al render 2D existente + drag & drop de assets)
 */
(function () {
  const HANDLE_R = 7;
  const ROT_HANDLE_DIST = 26;
  const SNAP_THRESHOLD_PCT = 2.2;

  const canvasState = {
    mode: 'focus',       // 'focus' | 'continuous' | 'diecut'
    snapEnabled: true,
    guidesEnabled: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    // Interacción activa
    dragAction: null,    // 'move' | 'scale' | 'rotate' | 'pan' | null
    dragCorner: null,
    dragStartMouse: [0, 0],
    dragStartLayer: null,
    dragStartDist: 1,
    dragStartAngle: 0,
    snapGuides: { x: false, y: false },
    lastSnapX: false,
    lastSnapY: false,
    lastSnapRot: false
  };

  let bridge = null; // { getActiveFace, getFaceByKey, getSelectedLayer, selectLayer, onFaceMutated, pushHistory, getState, getWIN, drawDiecut2D }

  function init(b) {
    bridge = b;
    setupCanvasEvents();
  }

  function getCanvas() {
    return document.getElementById('studio-focus-canvas');
  }

  function getCurrentTargetMetrics() {
    if (!bridge) return null;
    if (canvasState.mode === 'continuous') {
      const fBody = bridge.getFaceByKey('front');
      const fLid = bridge.getFaceByKey('lidFront');
      return {
        isContinuous: true,
        wMm: 55,
        hMm: 88, // 26 (lidFront arriba) + 62 (front abajo)
        lidH: 26,
        bodyH: 62,
        faces: [fLid, fBody],
        primaryFace: fBody
      };
    }
    const f = bridge.getActiveFace();
    if (!f) return null;
    return {
      isContinuous: false,
      wMm: f.w,
      hMm: f.h,
      faces: [f],
      primaryFace: f
    };
  }

  function getFaceRectOnCanvas(canvas, metrics) {
    const pad = 64;
    const availW = Math.max(80, canvas.width - pad * 2);
    const availH = Math.max(80, canvas.height - pad * 2);
    const basePxPerMm = Math.min(availW / metrics.wMm, availH / metrics.hMm);
    const pxPerMm = basePxPerMm * canvasState.zoom;
    const fw = metrics.wMm * pxPerMm;
    const fh = metrics.hMm * pxPerMm;
    const x0 = (canvas.width - fw) / 2 + canvasState.panX;
    const y0 = (canvas.height - fh) / 2 + canvasState.panY;
    return { x0, y0, fw, fh, pxPerMm };
  }

  /**
   * Transforma coordenadas locales de la capa a puntos en pantalla (para dibujar gizmo y hit-test).
   */
  function getLayerGizmoGeometry(layer, rect) {
    const cx = rect.x0 + rect.fw * (0.5 + (layer.x || 0) / 100);
    const cy = rect.y0 + rect.fh * (0.5 - (layer.y || 0) / 100);
    const { dw, dh } = window.StudioLayers.getLayerDrawSize(layer, rect.fw, rect.fh);
    const rad = ((layer.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const hw = dw / 2, hh = dh / 2;

    const rotPt = (lx, ly) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
    const corners = [
      rotPt(-hw, -hh), // TL
      rotPt(hw, -hh),  // TR
      rotPt(hw, hh),   // BR
      rotPt(-hw, hh)   // BL
    ];
    const topMid = rotPt(0, -hh);
    const rotHandle = rotPt(0, -hh - ROT_HANDLE_DIST);

    return { cx, cy, dw, dh, rad, corners, topMid, rotHandle };
  }

  function pointInRotatedBox(px, py, geom) {
    const dx = px - geom.cx;
    const dy = py - geom.cy;
    const cos = Math.cos(-geom.rad), sin = Math.sin(-geom.rad);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= geom.dw / 2 + 6 && Math.abs(ly) <= geom.dh / 2 + 6;
  }

  function resize() {
    const canvas = getCanvas();
    if (!canvas || !canvas.parentElement) return;
    const wrap = canvas.parentElement;
    if (wrap.clientWidth === 0 || wrap.clientHeight === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(wrap.clientWidth * dpr);
    canvas.height = Math.round(wrap.clientHeight * dpr);
    render();
  }

  function render() {
    if (!bridge) return;
    if (canvasState.mode === 'diecut') {
      bridge.drawDiecut2D();
      return;
    }

    const canvas = getCanvas();
    if (!canvas || !canvas.width || !canvas.height) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const isDark = bridge.getState().dark;

    // Fondo mesa de trabajo
    ctx.fillStyle = isDark ? '#13151d' : '#ebe4d8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Patrón de puntos sutil estilo Figma
    const gridGap = 24 * dpr;
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(100,85,70,0.12)';
    for (let x = gridGap / 2; x < canvas.width; x += gridGap) {
      for (let y = gridGap / 2; y < canvas.height; y += gridGap) {
        ctx.fillRect(x, y, 1.5 * dpr, 1.5 * dpr);
      }
    }

    const metrics = getCurrentTargetMetrics();
    if (!metrics) return;
    const rect = getFaceRectOnCanvas(canvas, metrics);

    // Sombra suave bajo la cara
    ctx.save();
    ctx.shadowColor = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(60,40,20,0.22)';
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 8 * dpr;
    ctx.fillStyle = isDark ? '#1e2028' : '#ffffff';
    ctx.fillRect(rect.x0, rect.y0, rect.fw, rect.fh);
    ctx.restore();

    // Renderizar contenido de la cara (o las dos caras en Frente Continuo)
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x0, rect.y0, rect.fw, rect.fh);
    ctx.clip();

    if (metrics.isContinuous) {
      const [fLid, fBody] = metrics.faces;
      const lidHpx = (metrics.lidH / metrics.hMm) * rect.fh;
      const bodyHpx = rect.fh - lidHpx;
      const lidCanvas = window.StudioLayers.renderFaceCanvasUnified(fLid, 10);
      const bodyCanvas = window.StudioLayers.renderFaceCanvasUnified(fBody, 10);
      ctx.drawImage(lidCanvas, rect.x0, rect.y0, rect.fw, lidHpx);
      ctx.drawImage(bodyCanvas, rect.x0, rect.y0 + lidHpx, rect.fw, bodyHpx);

      // Línea punteada divisoria Tapa / Cuerpo
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6 * dpr;
      ctx.setLineDash([7 * dpr, 5 * dpr]);
      ctx.beginPath();
      ctx.moveTo(rect.x0, rect.y0 + lidHpx);
      ctx.lineTo(rect.x0 + rect.fw, rect.y0 + lidHpx);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.92)';
      ctx.font = `600 ${10 * dpr}px Inter, sans-serif`;
      ctx.fillText('✂ Corte de tapa (26 mm / 62 mm)', rect.x0 + 8 * dpr, rect.y0 + lidHpx - 6 * dpr);
      ctx.restore();
    } else {
      const f = metrics.primaryFace;
      const faceCanvas = window.StudioLayers.renderFaceCanvasUnified(f, 10);
      ctx.drawImage(faceCanvas, rect.x0, rect.y0, rect.fw, rect.fh);
    }

    // Ventanita frontal si está activa
    const st = bridge.getState();
    const WIN = bridge.getWIN();
    if (st.hasWindow && (metrics.isContinuous || metrics.primaryFace.k === 'front')) {
      const topOffsetMm = metrics.isContinuous ? metrics.lidH : 0;
      const wx = rect.x0 + WIN.mx * rect.pxPerMm;
      const wy = rect.y0 + (topOffsetMm + WIN.my) * rect.pxPerMm;
      const ww = WIN.w * rect.pxPerMm;
      const wh = WIN.h * rect.pxPerMm;
      ctx.save();
      ctx.fillStyle = isDark ? 'rgba(19,21,29,0.78)' : 'rgba(235,228,216,0.78)';
      ctx.beginPath();
      ctx.roundRect(wx, wy, ww, wh, WIN.r * rect.pxPerMm);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6 * dpr;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.font = `600 ${10 * dpr}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('VENTANA 35×38 mm', wx + ww / 2, wy + wh / 2);
      ctx.restore();
    }

    // Muesca anti-colisión en Frente Bolsillo
    if (!metrics.isContinuous && metrics.primaryFace.k === 'pocketFront') {
      const nw = 9 * rect.pxPerMm;
      const nh = (83 - 61) * rect.pxPerMm; // muesca superior izquierda
      ctx.save();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(rect.x0, rect.y0, nw, nh);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.4 * dpr;
      ctx.setLineDash([4 * dpr, 3 * dpr]);
      ctx.strokeRect(rect.x0, rect.y0, nw, nh);
      ctx.restore();
    }

    // Guías de seguridad (2 mm hacia adentro)
    if (canvasState.guidesEnabled) {
      const m = 2 * rect.pxPerMm;
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeRect(rect.x0 + m, rect.y0 + m, rect.fw - m * 2, rect.fh - m * 2);
      ctx.restore();
    }

    // Guías magnéticas activas (Snap al centro)
    if (canvasState.snapGuides.x) {
      ctx.save();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.3 * dpr;
      ctx.beginPath();
      ctx.moveTo(rect.x0 + rect.fw / 2, rect.y0);
      ctx.lineTo(rect.x0 + rect.fw / 2, rect.y0 + rect.fh);
      ctx.stroke();
      ctx.restore();
    }
    if (canvasState.snapGuides.y) {
      ctx.save();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 1.3 * dpr;
      ctx.beginPath();
      ctx.moveTo(rect.x0, rect.y0 + rect.fh / 2);
      ctx.lineTo(rect.x0 + rect.fw, rect.y0 + rect.fh / 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // fin clip cara

    // Borde exterior de la cara + dimensiones
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(60,40,20,0.28)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.strokeRect(rect.x0, rect.y0, rect.fw, rect.fh);

    ctx.fillStyle = isDark ? '#a1a1aa' : '#57534e';
    ctx.font = `600 ${11 * dpr}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    const titleLabel = metrics.isContinuous
      ? `Frente Continuo (Tapa + Cuerpo) · ${metrics.wMm} × ${metrics.hMm} mm`
      : `${metrics.primaryFace.n} · Lado ${metrics.primaryFace.side} · ${metrics.wMm} × ${metrics.hMm} mm`;
    ctx.fillText(titleLabel, rect.x0 + rect.fw / 2, rect.y0 - 14 * dpr);

    // Dibujar Gizmo de transformación (handles) de la capa seleccionada
    const selLayer = bridge.getSelectedLayer();
    if (selLayer && selLayer.visible !== false && !selLayer.locked) {
      const targetRect = metrics.isContinuous
        ? {
            ...rect,
            y0: rect.y0 + (metrics.lidH / metrics.hMm) * rect.fh,
            fh: (metrics.bodyH / metrics.hMm) * rect.fh
          }
        : rect;
      const geom = getLayerGizmoGeometry(selLayer, targetRect);

      ctx.save();
      // Caja delimitadora
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      geom.corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.stroke();

      // Línea hacia el tirador de rotación
      ctx.beginPath();
      ctx.moveTo(geom.topMid[0], geom.topMid[1]);
      ctx.lineTo(geom.rotHandle[0], geom.rotHandle[1]);
      ctx.stroke();

      // Tiradores de esquina (escala)
      const r = HANDLE_R * dpr;
      geom.corners.forEach(([x, y]) => {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
        ctx.fill();
        ctx.stroke();
      });

      // Tirador de rotación (círculo superior)
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(geom.rotHandle[0], geom.rotHandle[1], r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function setupCanvasEvents() {
    const canvas = getCanvas();
    if (!canvas) return;

    const getPos = e => {
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / Math.max(1, r.width);
      return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
    };

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', e => {
      if (!bridge || canvasState.mode === 'diecut') return;
      const [sx, sy] = getPos(e);
      const metrics = getCurrentTargetMetrics();
      if (!metrics) return;
      const rect = getFaceRectOnCanvas(canvas, metrics);
      const targetRect = metrics.isContinuous
        ? {
            ...rect,
            y0: rect.y0 + (metrics.lidH / metrics.hMm) * rect.fh,
            fh: (metrics.bodyH / metrics.hMm) * rect.fh
          }
        : rect;

      if (e.button === 1 || e.button === 2) {
        canvasState.dragAction = 'pan';
        canvasState.dragStartMouse = [sx, sy];
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const hitR = (HANDLE_R + 6) * dpr;
      const selLayer = bridge.getSelectedLayer();

      // 1. Verificar tiradores de la capa activa (rotación y esquinas)
      if (selLayer && selLayer.visible !== false && !selLayer.locked) {
        const geom = getLayerGizmoGeometry(selLayer, targetRect);
        if (Math.hypot(sx - geom.rotHandle[0], sy - geom.rotHandle[1]) <= hitR) {
          bridge.pushHistory();
          canvasState.dragAction = 'rotate';
          canvasState.dragStartMouse = [sx, sy];
          canvasState.dragStartLayer = { ...selLayer };
          canvasState.dragStartAngle = Math.atan2(sy - geom.cy, sx - geom.cx);
          if (window.StudioAudio) window.StudioAudio.resetRotateTracker(selLayer.rot || 0);
          return;
        }
        for (let i = 0; i < geom.corners.length; i++) {
          const [cx, cy] = geom.corners[i];
          if (Math.hypot(sx - cx, sy - cy) <= hitR) {
            bridge.pushHistory();
            canvasState.dragAction = 'scale';
            canvasState.dragCorner = i;
            canvasState.dragStartMouse = [sx, sy];
            canvasState.dragStartLayer = { ...selLayer };
            canvasState.dragStartDist = Math.max(10, Math.hypot(sx - geom.cx, sy - geom.cy));
            if (window.StudioAudio) window.StudioAudio.resetScaleTracker(selLayer.scale || 100);
            return;
          }
        }
      }

      // 2. Hit-test de capas de arriba hacia abajo para seleccionar y mover
      const f = metrics.primaryFace;
      window.StudioLayers.ensureFaceLayers(f);
      for (let i = f.layers.length - 1; i >= 0; i--) {
        const lyr = f.layers[i];
        if (lyr.visible === false || lyr.locked) continue;
        const geom = getLayerGizmoGeometry(lyr, targetRect);
        if (pointInRotatedBox(sx, sy, geom)) {
          bridge.selectLayer(lyr.id);
          bridge.pushHistory();
          canvasState.dragAction = 'move';
          canvasState.dragStartMouse = [sx, sy];
          canvasState.dragStartLayer = { ...lyr };
          canvasState.lastSnapX = false;
          canvasState.lastSnapY = false;
          return;
        }
      }

      // 3. Si hizo clic afuera, panear lienzo
      canvasState.dragAction = 'pan';
      canvasState.dragStartMouse = [sx, sy];
    });

    window.addEventListener('mousemove', e => {
      if (!canvasState.dragAction || !bridge || canvasState.mode === 'diecut') return;
      const [sx, sy] = getPos(e);
      const metrics = getCurrentTargetMetrics();
      if (!metrics) return;
      const rect = getFaceRectOnCanvas(canvas, metrics);
      const targetRect = metrics.isContinuous
        ? {
            ...rect,
            y0: rect.y0 + (metrics.lidH / metrics.hMm) * rect.fh,
            fh: (metrics.bodyH / metrics.hMm) * rect.fh
          }
        : rect;

      const dx = sx - canvasState.dragStartMouse[0];
      const dy = sy - canvasState.dragStartMouse[1];

      if (canvasState.dragAction === 'pan') {
        canvasState.panX += dx;
        canvasState.panY += dy;
        canvasState.dragStartMouse = [sx, sy];
        render();
        return;
      }

      const selLayer = bridge.getSelectedLayer();
      if (!selLayer || !canvasState.dragStartLayer) return;

      if (canvasState.dragAction === 'move') {
        let nx = canvasState.dragStartLayer.x + (dx / targetRect.fw) * 100;
        let ny = canvasState.dragStartLayer.y - (dy / targetRect.fh) * 100;

        let snappedX = false, snappedY = false;
        if (canvasState.snapEnabled && !e.altKey) {
          if (Math.abs(nx) < SNAP_THRESHOLD_PCT) { nx = 0; snappedX = true; }
          if (Math.abs(ny) < SNAP_THRESHOLD_PCT) { ny = 0; snappedY = true; }
        }
        if ((snappedX && !canvasState.lastSnapX) || (snappedY && !canvasState.lastSnapY)) {
          if (window.StudioAudio) window.StudioAudio.playSnap();
        }
        canvasState.lastSnapX = snappedX;
        canvasState.lastSnapY = snappedY;
        canvasState.snapGuides = { x: snappedX, y: snappedY };

        selLayer.x = Math.max(-120, Math.min(120, Math.round(nx * 10) / 10));
        selLayer.y = Math.max(-120, Math.min(120, Math.round(ny * 10) / 10));
        syncContinuousIfNeeded(metrics, selLayer);
        bridge.onFaceMutated(metrics.faces, true);
        render();
      } else if (canvasState.dragAction === 'scale') {
        const geom = getLayerGizmoGeometry(canvasState.dragStartLayer, targetRect);
        const curDist = Math.max(8, Math.hypot(sx - geom.cx, sy - geom.cy));
        const ratio = curDist / canvasState.dragStartDist;
        const minS = selLayer.type === 'sticker' ? 5 : 10;
        const maxS = 300;
        const nextScale = Math.max(minS, Math.min(maxS, Math.round(canvasState.dragStartLayer.scale * ratio)));
        if (nextScale !== selLayer.scale) {
          selLayer.scale = nextScale;
          if (window.StudioAudio) window.StudioAudio.onScaleChange(nextScale, minS, maxS, 2);
          syncContinuousIfNeeded(metrics, selLayer);
          bridge.onFaceMutated(metrics.faces, true);
          render();
        }
      } else if (canvasState.dragAction === 'rotate') {
        const geom = getLayerGizmoGeometry(canvasState.dragStartLayer, targetRect);
        const curAngle = Math.atan2(sy - geom.cy, sx - geom.cx);
        let deg = canvasState.dragStartLayer.rot + ((curAngle - canvasState.dragStartAngle) * 180) / Math.PI;
        // Normalizar a -180..180
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        let snappedRot = false;
        if (canvasState.snapEnabled && !e.altKey) {
          for (const target of [-180, -90, 0, 90, 180]) {
            if (Math.abs(deg - target) < 4.5) {
              deg = target;
              snappedRot = true;
              break;
            }
          }
        }
        if (snappedRot && !canvasState.lastSnapRot && window.StudioAudio) window.StudioAudio.playSnap();
        canvasState.lastSnapRot = snappedRot;
        const rounded = Math.round(deg);
        if (rounded !== selLayer.rot) {
          selLayer.rot = rounded;
          if (!snappedRot && window.StudioAudio) window.StudioAudio.onRotateChange(rounded, 5);
          syncContinuousIfNeeded(metrics, selLayer);
          bridge.onFaceMutated(metrics.faces, true);
          render();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (!canvasState.dragAction) return;
      canvasState.dragAction = null;
      canvasState.dragStartLayer = null;
      canvasState.snapGuides = { x: false, y: false };
      if (window.StudioAudio) {
        window.StudioAudio.resetScaleTracker(null);
        window.StudioAudio.resetRotateTracker(null);
      }
      render();
    });

    canvas.addEventListener('wheel', e => {
      if (canvasState.mode === 'diecut') return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      canvasState.zoom = Math.max(0.45, Math.min(3.5, canvasState.zoom * factor));
      render();
    }, { passive: false });
  }

  /**
   * En modo Frente Continuo, sincroniza una capa editada sobre front (62 mm)
   * también como espejo posicionado en lidFront (26 mm) para que el arte cruce la tapa sin cortes.
   */
  function syncContinuousIfNeeded(metrics, layer) {
    if (!metrics.isContinuous) return;
    const [fLid, fBody] = metrics.faces;
    window.StudioLayers.ensureFaceLayers(fLid);
    const mirrorId = `cont_${layer.id}`;
    let twin = fLid.layers.find(l => l.id === mirrorId);
    // Convertir coordenada Y desde centro de body (h=62) al centro de lid (h=26)
    // Distancia entre centros = (62/2 + 26/2) = 44 mm
    const yMmFromBodyCenter = (layer.y / 100) * 62;
    const yMmFromLidCenter = yMmFromBodyCenter - 44;
    const yPctLid = (yMmFromLidCenter / 26) * 100;
    // Ajustar escala relativa porque lid tiene altura 26 vs 62
    const scaleFactor = layer.type === 'sticker' ? (55 / 26) : (62 / 26);

    if (!twin) {
      twin = { ...layer, id: mirrorId, name: `${layer.name} (cont.)` };
      fLid.layers.push(twin);
    } else {
      Object.assign(twin, layer, { id: mirrorId, name: `${layer.name} (cont.)` });
    }
    twin.y = Math.round(yPctLid * 10) / 10;
    if (layer.type === 'sticker') {
      twin.scale = Math.round(layer.scale * (Math.min(55, 62) / Math.min(55, 26)));
    } else if (layer.type === 'image') {
      twin.fitMode = 'contain';
      twin.scale = Math.round(layer.scale * scaleFactor);
    }
  }

  function setMode(mode) {
    canvasState.mode = mode;
    canvasState.zoom = 1;
    canvasState.panX = 0;
    canvasState.panY = 0;
    const focusWrap = document.getElementById('studio-focus-wrap');
    const diecutWrap = document.getElementById('canvas2d-wrap');
    if (focusWrap && diecutWrap) {
      focusWrap.classList.toggle('hidden', mode === 'diecut');
      diecutWrap.classList.toggle('hidden', mode !== 'diecut');
    }
    requestAnimationFrame(() => {
      if (mode === 'diecut') bridge && bridge.fitDiecut2D && bridge.fitDiecut2D();
      else resize();
    });
  }

  function resetZoom() {
    canvasState.zoom = 1;
    canvasState.panX = 0;
    canvasState.panY = 0;
    render();
  }

  function zoomBy(factor) {
    canvasState.zoom = Math.max(0.45, Math.min(3.5, canvasState.zoom * factor));
    render();
  }

  window.StudioCanvas = {
    init,
    resize,
    render,
    setMode,
    resetZoom,
    zoomBy,
    state: canvasState
  };
})();
