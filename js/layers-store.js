/**
 * StudioLayers — Modelo unificado de capas por cara, renderizador multi-capa,
 * paleta de colores automática, compatibilidad con v2.3/Celestial e historial Undo/Redo.
 */
(function () {
  const MAX_HISTORY = 35;
  const undoStack = [];
  const redoStack = [];
  let isRestoringHistory = false;
  let lastPalette = ['#1a242e', '#caa368', '#f5f2eb', '#4c1d24', '#18181b'];

  function genId(prefix = 'lyr') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Garantiza que una cara tenga f.layers sincronizado con cualquier dato legacy (v2.3).
   */
  function ensureFaceLayers(f) {
    if (!Array.isArray(f.layers)) f.layers = [];
    // Migración única si existen datos legacy y layers está vacío
    if (f.layers.length === 0 && (f.img || (f.overlays && f.overlays.length > 0))) {
      if (f.img) {
        f.layers.push({
          id: genId('img'),
          type: 'image',
          name: 'Imagen Principal',
          visible: true,
          locked: false,
          opacity: 1,
          x: f.ox || 0,
          y: f.oy || 0,
          scale: Math.round((f.zoom || 1) * 100),
          rot: (f.rot || 0) * 90,
          fh: !!f.fh,
          fv: !!f.fv,
          fitMode: 'cover',
          crop: f.crop || null,
          img: f.img,
          src: f.img.src || null
        });
      }
      if (Array.isArray(f.overlays)) {
        f.overlays.forEach(ov => {
          f.layers.push({
            id: ov.id || genId('st'),
            type: 'sticker',
            name: ov.name || 'Sticker',
            visible: true,
            locked: false,
            opacity: 1,
            x: ov.x || 0,
            y: ov.y || 0,
            scale: ov.scale || 55,
            rot: ov.rot || 0,
            fh: false,
            fv: false,
            tintEnabled: !!ov.tintEnabled,
            tintColor: ov.tintColor || '#caa368',
            img: ov.img || null,
            src: ov.src || (ov.img ? ov.img.src : null)
          });
        });
      }
      // Limpiar propiedades legacy para evitar doble renderizado
      f.img = null;
      f.overlays = [];
      f.crop = null;
    }
    return f.layers;
  }

  function faceHasContentUnified(f) {
    ensureFaceLayers(f);
    return !!(f.fillColor || f.layers.some(l => l.visible !== false));
  }

  function createImageLayer(img, opts = {}) {
    return {
      id: genId('img'),
      type: 'image',
      name: (opts.name || 'Imagen').slice(0, 26),
      visible: true,
      locked: false,
      opacity: opts.opacity ?? 1,
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      scale: opts.scale ?? 100,
      rot: opts.rot ?? 0,
      fh: !!opts.fh,
      fv: !!opts.fv,
      fitMode: opts.fitMode || 'cover',
      crop: opts.crop || null,
      img,
      src: img ? img.src : (opts.src || null)
    };
  }

  function createStickerLayer(img, opts = {}) {
    return {
      id: genId('st'),
      type: 'sticker',
      name: (opts.name || 'Sticker').slice(0, 26),
      visible: true,
      locked: false,
      opacity: opts.opacity ?? 1,
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      scale: opts.scale ?? 55,
      rot: opts.rot ?? 0,
      fh: false,
      fv: false,
      tintEnabled: !!opts.tintEnabled,
      tintColor: opts.tintColor || '#caa368',
      img,
      src: img ? img.src : (opts.src || null)
    };
  }

  function createTextLayer(opts = {}) {
    return {
      id: genId('txt'),
      type: 'text',
      name: (opts.text || 'Texto').slice(0, 22),
      visible: true,
      locked: false,
      opacity: opts.opacity ?? 1,
      x: opts.x ?? 0,
      y: opts.y ?? 0,
      scale: opts.scale ?? 100,
      rot: opts.rot ?? 0,
      fh: false,
      fv: false,
      text: opts.text || 'Tu Texto',
      fontFamily: opts.fontFamily || 'Playfair Display',
      fontSize: opts.fontSize ?? 14, // En porcentaje relativo al ancho de la cara (~mm virtuales)
      fontWeight: opts.fontWeight || '700',
      fontStyle: opts.fontStyle || 'normal',
      color: opts.color || '#ffffff',
      strokeEnabled: opts.strokeEnabled ?? true,
      strokeColor: opts.strokeColor || '#000000',
      strokeWidth: opts.strokeWidth ?? 3,
      shadowEnabled: opts.shadowEnabled ?? false,
      align: opts.align || 'center',
      letterSpacing: opts.letterSpacing ?? 0
    };
  }

  /**
   * Calcula las dimensiones dibujadas (en píxeles de canvas de cara) de una capa
   * para tanto el renderizado como el bounding-box interactivo (handles).
   */
  function getLayerDrawSize(layer, faceWpx, faceHpx) {
    if (layer.type === 'image' && layer.img) {
      const scaleFactor = (layer.scale || 100) / 100;
      if (layer.crop) {
        return { dw: faceWpx * scaleFactor, dh: faceHpx * scaleFactor };
      }
      const iw = layer.img.naturalWidth || layer.img.width || 100;
      const ih = layer.img.naturalHeight || layer.img.height || 100;
      const rotMod = Math.abs(Math.round((layer.rot || 0) / 90)) % 2;
      const baseScale = layer.fitMode === 'contain'
        ? Math.min(faceWpx / iw, faceHpx / ih)
        : Math.max((rotMod ? faceHpx : faceWpx) / iw, (rotMod ? faceWpx : faceHpx) / ih);
      const s = baseScale * scaleFactor;
      return { dw: iw * s, dh: ih * s };
    }
    if (layer.type === 'sticker' && layer.img) {
      const iw = layer.img.naturalWidth || layer.img.width || 100;
      const ih = layer.img.naturalHeight || layer.img.height || 100;
      const targetW = Math.min(faceWpx, faceHpx) * ((layer.scale || 55) / 100);
      const ratio = ih / Math.max(1, iw);
      return { dw: targetW, dh: targetW * ratio };
    }
    if (layer.type === 'text') {
      const basePx = Math.max(10, (faceWpx * (layer.fontSize || 14) / 100) * ((layer.scale || 100) / 100));
      const lines = (layer.text || ' ').split('\n');
      const maxChars = Math.max(1, ...lines.map(l => l.length));
      const estW = Math.max(basePx * 1.6, basePx * 0.62 * maxChars);
      const estH = basePx * 1.25 * lines.length;
      return { dw: estW, dh: estH, fontPx: basePx };
    }
    return { dw: faceWpx * 0.4, dh: faceHpx * 0.4 };
  }

  /**
   * Renderiza una cara componiendo su fondo (fillColor) + todas las capas visibles en orden Z.
   */
  function renderFaceCanvasUnified(f, pxPerMm = 8) {
    ensureFaceLayers(f);
    const c = document.createElement('canvas');
    c.width = Math.max(16, Math.round(f.w * pxPerMm));
    c.height = Math.max(16, Math.round(f.h * pxPerMm));
    const ctx = c.getContext('2d');

    // Fondo base de la cara
    const kraftFallback = f.side === 'B' ? '#c59262' : '#d4a373';
    const hasVisualLayer = f.layers.some(l => l.visible !== false);
    ctx.fillStyle = f.fillColor || (hasVisualLayer ? (f.bgColor || kraftFallback) : kraftFallback);
    ctx.fillRect(0, 0, c.width, c.height);

    // Capas en orden Z (0 = abajo, N-1 = arriba)
    for (const layer of f.layers) {
      if (layer.visible === false) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity ?? 1));

      const cx = c.width * (0.5 + (layer.x || 0) / 100);
      const cy = c.height * (0.5 - (layer.y || 0) / 100);
      ctx.translate(cx, cy);
      ctx.rotate(((layer.rot || 0) * Math.PI) / 180);
      ctx.scale(layer.fh ? -1 : 1, layer.fv ? -1 : 1);

      if (layer.type === 'image' && layer.img) {
        const { dw, dh } = getLayerDrawSize(layer, c.width, c.height);
        if (layer.crop) {
          const [u0, v0, u1, v1] = layer.crop;
          const iw = layer.img.naturalWidth || layer.img.width;
          const ih = layer.img.naturalHeight || layer.img.height;
          ctx.drawImage(
            layer.img,
            u0 * iw, v0 * ih, Math.max(1, (u1 - u0) * iw), Math.max(1, (v1 - v0) * ih),
            -dw / 2, -dh / 2, dw, dh
          );
        } else {
          ctx.drawImage(layer.img, -dw / 2, -dh / 2, dw, dh);
        }
      } else if (layer.type === 'sticker' && layer.img) {
        const { dw, dh } = getLayerDrawSize(layer, c.width, c.height);
        if (layer.tintEnabled && layer.tintColor) {
          const tc = document.createElement('canvas');
          tc.width = Math.max(2, Math.round(dw));
          tc.height = Math.max(2, Math.round(dh));
          const tctx = tc.getContext('2d');
          tctx.drawImage(layer.img, 0, 0, tc.width, tc.height);
          tctx.globalCompositeOperation = 'source-in';
          tctx.fillStyle = layer.tintColor;
          tctx.fillRect(0, 0, tc.width, tc.height);
          ctx.drawImage(tc, -dw / 2, -dh / 2, dw, dh);
        } else {
          ctx.drawImage(layer.img, -dw / 2, -dh / 2, dw, dh);
        }
      } else if (layer.type === 'text') {
        const fontPx = Math.max(10, (c.width * (layer.fontSize || 14) / 100) * ((layer.scale || 100) / 100));
        ctx.font = `${layer.fontStyle || 'normal'} ${layer.fontWeight || '700'} ${fontPx}px "${layer.fontFamily || 'Inter'}", sans-serif`;
        ctx.textAlign = layer.align || 'center';
        ctx.textBaseline = 'middle';
        const lines = (layer.text || '').split('\n');
        const lineH = fontPx * 1.2;
        const startY = -((lines.length - 1) * lineH) / 2;

        if (layer.shadowEnabled) {
          ctx.shadowColor = 'rgba(0,0,0,0.65)';
          ctx.shadowBlur = fontPx * 0.22;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = fontPx * 0.08;
        }

        lines.forEach((ln, idx) => {
          const ly = startY + idx * lineH;
          if (layer.strokeEnabled && (layer.strokeWidth || 0) > 0) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = (layer.strokeWidth || 2) * (pxPerMm / 8) * 1.4;
            ctx.strokeStyle = layer.strokeColor || '#000000';
            ctx.strokeText(ln, 0, ly);
          }
          ctx.fillStyle = layer.color || '#ffffff';
          ctx.fillText(ln, 0, ly);
        });
      }

      ctx.restore();
    }

    return c;
  }

  /**
   * Extrae hasta 5 colores dominantes distintos de una imagen para la paleta rápida.
   */
  function extractPaletteFromImage(img, maxColors = 5) {
    if (!img) return lastPalette;
    try {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 48, 48);
      const data = ctx.getImageData(0, 0, 48, 48).data;
      const buckets = new Map();

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 140) continue;
        // Cuantizar a bloques de 24 para agrupar tonos cercanos
        const r = Math.round(data[i] / 24) * 24;
        const g = Math.round(data[i + 1] / 24) * 24;
        const b = Math.round(data[i + 2] / 24) * 24;
        const key = `${r},${g},${b}`;
        const prev = buckets.get(key) || { r, g, b, count: 0 };
        prev.count++;
        buckets.set(key, prev);
      }

      const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
      const picked = [];
      for (const item of sorted) {
        if (picked.length >= maxColors) break;
        const tooClose = picked.some(p => Math.hypot(p.r - item.r, p.g - item.g, p.b - item.b) < 52);
        if (!tooClose) picked.push(item);
      }
      const toHex = v => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0');
      const hexes = picked.map(p => `#${toHex(p.r)}${toHex(p.g)}${toHex(p.b)}`);
      if (hexes.length) lastPalette = hexes;
    } catch (e) {}
    return lastPalette;
  }

  function getLastPalette() {
    return lastPalette;
  }

  /**
   * Snapshot rápido en memoria para Undo/Redo (mantiene referencias de Image para 0 lag).
   */
  function captureHistorySnapshot(faces, appState) {
    return {
      innerCustomColor: appState.innerCustomColor,
      innerColorHex: appState.innerColorHex,
      faces: faces.map(f => {
        ensureFaceLayers(f);
        return {
          k: f.k,
          fillColor: f.fillColor,
          bgColor: f.bgColor,
          layers: f.layers.map(l => ({ ...l, crop: l.crop ? [...l.crop] : null }))
        };
      })
    };
  }

  function pushHistory(faces, appState) {
    if (isRestoringHistory) return;
    undoStack.push(captureHistorySnapshot(faces, appState));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    window.dispatchEvent(new CustomEvent('studio:history-changed'));
  }

  function applyHistorySnapshot(snap, faces, appState) {
    if (!snap) return;
    isRestoringHistory = true;
    appState.innerCustomColor = snap.innerCustomColor;
    appState.innerColorHex = snap.innerColorHex;
    snap.faces.forEach(sf => {
      const f = faces.find(x => x.k === sf.k);
      if (!f) return;
      f.fillColor = sf.fillColor;
      f.bgColor = sf.bgColor;
      f.img = null;
      f.overlays = [];
      f.layers = sf.layers.map(l => ({ ...l, crop: l.crop ? [...l.crop] : null }));
    });
    isRestoringHistory = false;
  }

  function undo(faces, appState) {
    if (undoStack.length === 0) return false;
    redoStack.push(captureHistorySnapshot(faces, appState));
    const prev = undoStack.pop();
    applyHistorySnapshot(prev, faces, appState);
    if (window.StudioAudio) window.StudioAudio.playAction('undo');
    window.dispatchEvent(new CustomEvent('studio:history-changed'));
    return true;
  }

  function redo(faces, appState) {
    if (redoStack.length === 0) return false;
    undoStack.push(captureHistorySnapshot(faces, appState));
    const next = redoStack.pop();
    applyHistorySnapshot(next, faces, appState);
    if (window.StudioAudio) window.StudioAudio.playAction('redo');
    window.dispatchEvent(new CustomEvent('studio:history-changed'));
    return true;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  /**
   * Serialización v3 (compatible con IndexedDB y .fliptop.json).
   */
  function imageToDataURL(img) {
    if (!img) return null;
    if (img.src && img.src.startsWith('data:')) return img.src;
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width || 512;
      c.height = img.naturalHeight || img.height || 512;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    } catch (e) {
      return img.src || null;
    }
  }

  function serializeDesignV3(faces, appState, name, thumbnail, meta = {}) {
    const facesData = {};
    faces.forEach(f => {
      ensureFaceLayers(f);
      facesData[f.k] = {
        fillColor: f.fillColor,
        bgColor: f.bgColor,
        layers: f.layers.map(l => {
          const copy = { ...l };
          delete copy.img;
          if (l.type === 'image' || l.type === 'sticker') {
            copy.src = l.img ? imageToDataURL(l.img) : l.src;
          }
          return copy;
        })
      };
    });
    return {
      id: 'des_' + Date.now(),
      version: 3,
      name: name || 'Mi Diseño',
      note: meta.note || '',
      createdAt: Date.now(),
      thumbnail: thumbnail || null,
      hasPocket: appState.hasPocket,
      hasWindow: appState.hasWindow,
      innerCustomColor: appState.innerCustomColor,
      innerColorHex: appState.innerColorHex,
      faces: facesData
    };
  }

  async function deserializeDesignV3(record, faces, appState, initFaceFn) {
    const loadImg = src => new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    appState.innerCustomColor = !!record.innerCustomColor;
    appState.innerColorHex = record.innerColorHex || '#1f2026';
    if (typeof record.hasPocket === 'boolean') appState.hasPocket = record.hasPocket;
    if (typeof record.hasWindow === 'boolean') appState.hasWindow = record.hasWindow;

    await Promise.all(faces.map(async f => {
      initFaceFn(f);
      const d = record.faces && record.faces[f.k];
      if (!d) return;
      f.fillColor = d.fillColor || null;
      f.bgColor = d.bgColor || '#ffffff';

      if (Array.isArray(d.layers)) {
        // Formato v3
        f.layers = await Promise.all(d.layers.map(async l => {
          const copy = { ...l, id: l.id || genId(l.type) };
          if ((l.type === 'image' || l.type === 'sticker') && l.src) {
            copy.img = await loadImg(l.src);
          }
          return copy;
        }));
      } else {
        // Formato legacy v2.x
        f.rot = d.rot || 0; f.fh = !!d.fh; f.fv = !!d.fv;
        f.zoom = d.zoom || 1; f.ox = d.ox || 0; f.oy = d.oy || 0; f.crop = d.crop || null;
        if (d.imgData) f.img = await loadImg(d.imgData);
        if (Array.isArray(d.overlays) && d.overlays.length) {
          f.overlays = await Promise.all(d.overlays.map(async o => ({
            id: o.id || genId('st'),
            name: o.name || 'Sticker',
            x: o.x || 0, y: o.y || 0, scale: o.scale || 55, rot: o.rot || 0,
            tintEnabled: !!o.tintEnabled, tintColor: o.tintColor || '#caa368',
            src: o.src,
            img: o.src ? await loadImg(o.src) : null
          })));
        }
        ensureFaceLayers(f);
      }
    }));
  }

  window.StudioLayers = {
    genId,
    ensureFaceLayers,
    faceHasContentUnified,
    createImageLayer,
    createStickerLayer,
    createTextLayer,
    getLayerDrawSize,
    renderFaceCanvasUnified,
    extractPaletteFromImage,
    getLastPalette,
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    serializeDesignV3,
    deserializeDesignV3
  };
})();
