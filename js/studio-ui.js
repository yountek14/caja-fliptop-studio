/**
 * StudioUI — Orquestador de la Interfaz del Modo Estudio de Diseño (v3.0)
 * Gestiona los 3 modos globales ('studio' | '3d' | 'export'), el dock izquierdo
 * desplegable (Assets, Diseños Guardados, Texto, Fondo, Modelo), el panel derecho
 * de Capas + Inspector Contextual, el Mini-3D PiP y los atajos de teclado.
 */
(function () {
  const FONT_OPTIONS = [
    'Playfair Display',
    'Montserrat',
    'Bebas Neue',
    'Cinzel',
    'Oswald',
    'Pacifico',
    'Permanent Marker',
    'Inter'
  ];

  let api = null;
  let appMode = 'studio';         // 'studio' | '3d' | 'export'
  let studioSubMode = 'edit3d';   // 'focus' | 'continuous' | 'diecut' | 'edit3d' (default: Editar 3D)
  let activeDrawer = 'assets';    // 'assets' | 'designs' | 'text' | 'bg' | 'model' | null
  let activeAssetCat = 'shapes';  // 'shapes' | 'bands' | 'pop' | 'monster' | 'custom'
  let selectedLayerId = null;
  let pipCollapsed = false;
  let dragLayerIdx = null;

  function init(bridgeApi) {
    api = bridgeApi;
    setupTopBar();
    setupLeftDock();
    setupStudioToolbar();
    setupRightPanel();
    setupPiPControls();
    setupKeyboardShortcuts();
    window.addEventListener('studio:history-changed', syncUndoRedoButtons);

    // Hidratar íconos SVG personalizados y sincronizar audio
    if (window.StudioIcons) window.StudioIcons.hydrate(document);
    syncAudioButton();
    syncUndoRedoButtons();
    if (window.StudioColorWheel) window.StudioColorWheel.init('rgb-wheel-canvas');
    setAppMode('studio');
    setDrawer('assets');
    refreshAllUI();
  }

  function getActiveFace() {
    const activeFaces = api.getActiveExternalFaces();
    const k = api.getSelectedFaceKey();
    if (k === 'all') return activeFaces[0];
    return activeFaces.find(f => f.k === k) || activeFaces[0];
  }

  function getSelectedLayer() {
    const f = getActiveFace();
    if (!f) return null;
    window.StudioLayers.ensureFaceLayers(f);
    if (!selectedLayerId) return null;
    return f.layers.find(l => l.id === selectedLayerId) || null;
  }

  function selectLayer(id) {
    selectedLayerId = id;
    renderLayersPanel();
    renderInspectorPanel();
    if (window.StudioCanvas && studioSubMode !== 'edit3d') window.StudioCanvas.render();
    if (window.Studio3DEdit && studioSubMode === 'edit3d') {
      window.Studio3DEdit.rebuildGizmo();
      window.Studio3DEdit.syncOverlayUI();
    }
  }

  // =========================================================================
  // 1. BARRA SUPERIOR Y CAMBIO DE MODO ('studio' | '3d' | 'export')
  // =========================================================================
  function setupTopBar() {
    document.querySelectorAll('.app-mode-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.StudioAudio) window.StudioAudio.playAction('click');
        setAppMode(btn.dataset.mode);
      };
    });

    const btnUndo = document.getElementById('studio-undo-btn');
    const btnRedo = document.getElementById('studio-redo-btn');
    if (btnUndo) btnUndo.onclick = () => doUndo();
    if (btnRedo) btnRedo.onclick = () => doRedo();

    const btnAudio = document.getElementById('studio-audio-btn');
    if (btnAudio) {
      btnAudio.onclick = () => {
        window.StudioAudio.setEnabled(!window.StudioAudio.isEnabled());
        syncAudioButton();
      };
    }

    const btnQuickSave = document.getElementById('studio-quicksave-btn');
    if (btnQuickSave) {
      btnQuickSave.onclick = () => {
        setAppMode('studio');
        setDrawer('designs');
        const inp = document.getElementById('drawer-save-name');
        if (inp) inp.focus();
      };
    }
  }

  function syncAudioButton() {
    const btn = document.getElementById('studio-audio-btn');
    if (!btn || !window.StudioAudio) return;
    const on = window.StudioAudio.isEnabled();
    const ic = window.StudioIcons ? window.StudioIcons.svg(on ? 'sound-on' : 'sound-off', 'w-[18px] h-[18px]') : (on ? '🔊' : '🔇');
    btn.innerHTML = `${ic}<span class="hidden md:inline">${on ? 'Sonido' : 'Silencio'}</span>`;
    btn.className = `flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition ${
      on
        ? 'border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-300'
        : 'border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400'
    }`;
  }

  function syncUndoRedoButtons() {
    const u = document.getElementById('studio-undo-btn');
    const r = document.getElementById('studio-redo-btn');
    if (u) u.disabled = !window.StudioLayers.canUndo();
    if (r) r.disabled = !window.StudioLayers.canRedo();
  }

  function doUndo() {
    if (window.StudioLayers.undo(api.getExternalFaces(), api.getState())) {
      api.refreshAllMaterials();
      refreshAllUI();
      api.showToast('Deshecho');
    }
  }

  function doRedo() {
    if (window.StudioLayers.redo(api.getExternalFaces(), api.getState())) {
      api.refreshAllMaterials();
      refreshAllUI();
      api.showToast('Rehecho');
    }
  }

  function mount3DCanvasInto(targetId) {
    const container = document.getElementById('canvas-container');
    const target = document.getElementById(targetId);
    if (container && target && container.parentElement !== target) {
      target.appendChild(container);
    }
    requestAnimationFrame(() => api.onViewportResize());
  }

  function setAppMode(mode) {
    appMode = mode;
    const studioDock = document.getElementById('studio-left-dock');
    const studioDrawer = document.getElementById('studio-left-drawer');
    const studioRight = document.getElementById('studio-right-panel');
    const studioToolbar = document.getElementById('studio-canvas-toolbar');
    const pipBox = document.getElementById('studio-pip-3d');
    const legacyToolbar = document.getElementById('legacy-2d-toolbar');
    const legacyPanel = document.getElementById('control-panel');
    const pane2d = document.getElementById('pane-2d');
    const pane3d = document.getElementById('pane-3d');

    document.querySelectorAll('.app-mode-btn').forEach(btn => {
      const active = btn.dataset.mode === mode;
      btn.className = `app-mode-btn flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
        active
          ? 'bg-white dark:bg-zinc-900 text-amber-800 dark:text-amber-300 shadow-sm font-bold'
          : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 font-semibold'
      }`;
    });

    if (mode === 'studio') {
      // Transformar la UI por completo al Modo Estudio de Diseño
      studioDock.classList.remove('hidden');
      studioDock.classList.add('flex');
      studioDrawer.classList.toggle('hidden', !activeDrawer);
      studioRight.classList.remove('hidden');
      studioRight.classList.add('flex');
      studioToolbar.classList.remove('hidden');
      studioToolbar.classList.add('flex');
      pipBox.classList.remove('hidden');
      legacyToolbar.classList.add('hidden');
      legacyPanel.classList.add('hidden');

      pane2d.classList.remove('hidden');
      pane2d.classList.add('flex');
      pane3d.classList.add('hidden');

      // Asegurar que hay una cara concreta seleccionada para editar capas
      if (api.getSelectedFaceKey() === 'all') {
        api.selectFace('front');
      }

      applyStudioSubMode(studioSubMode);
      refreshAllUI();
    } else if (mode === '3d') {
      if (window.Studio3DEdit) window.Studio3DEdit.setActive(false);
      studioDock.classList.add('hidden');
      studioDock.classList.remove('flex');
      studioDrawer.classList.add('hidden');
      studioRight.classList.add('hidden');
      studioRight.classList.remove('flex');
      studioToolbar.classList.add('hidden');
      pipBox.classList.add('hidden');
      const wrap3d = document.getElementById('studio-3d-edit-wrap');
      if (wrap3d) wrap3d.classList.add('hidden');
      legacyPanel.classList.remove('hidden');

      pane2d.classList.add('hidden');
      pane2d.classList.remove('flex');
      pane3d.classList.remove('hidden');

      mount3DCanvasInto('pane-3d-host');
      api.setLegacyTab('fold');
    } else if (mode === 'export') {
      if (window.Studio3DEdit) window.Studio3DEdit.setActive(false);
      studioDock.classList.add('hidden');
      studioDock.classList.remove('flex');
      studioDrawer.classList.add('hidden');
      studioRight.classList.add('hidden');
      studioRight.classList.remove('flex');
      studioToolbar.classList.add('hidden');
      pipBox.classList.add('hidden');
      const wrap3d = document.getElementById('studio-3d-edit-wrap');
      if (wrap3d) wrap3d.classList.add('hidden');
      legacyToolbar.classList.remove('hidden');
      legacyPanel.classList.remove('hidden');

      pane2d.classList.remove('hidden');
      pane2d.classList.add('flex');
      pane3d.classList.add('hidden');

      // Mostrar troquel 2D completo en modo exportar
      const focusWrap = document.getElementById('studio-focus-wrap');
      const diecutWrap = document.getElementById('canvas2d-wrap');
      if (focusWrap) focusWrap.classList.add('hidden');
      if (diecutWrap) diecutWrap.classList.remove('hidden');

      mount3DCanvasInto('pane-3d-host');
      api.setLegacyTab('export');
      requestAnimationFrame(() => api.fit2DView());
    }

    requestAnimationFrame(() => {
      api.onViewportResize();
      if (mode === 'studio' && window.StudioCanvas) window.StudioCanvas.resize();
    });
  }

  // =========================================================================
  // 2. DOCK IZQUIERDO Y PANELES DESPLEGABLES (Assets, Diseños, Texto, Fondo, Modelo)
  // =========================================================================
  function setupLeftDock() {
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.StudioAudio) window.StudioAudio.playAction('click');
        const target = btn.dataset.drawer;
        setDrawer(activeDrawer === target ? null : target);
      };
    });

    const closeBtn = document.getElementById('drawer-close-btn');
    if (closeBtn) closeBtn.onclick = () => setDrawer(null);

    // --- RUEDA RGB Y BOTONES RÁPIDOS DE PINTADO ---
    const paintAllWithHex = hex => {
      api.pushHistory();
      const isKraft = hex === 'kraft';
      const active = api.getActiveExternalFaces();
      active.forEach(f => {
        f.fillColor = isKraft ? null : hex;
        if (!isKraft) f.bgColor = hex;
        api.applyFaceMaterial(f);
      });
      api.updateCoverageUI();
      refreshAllUI();
      if (window.StudioAudio) window.StudioAudio.playAction('add');
      api.showToast(isKraft ? 'Toda la caja restaurada a cartón kraft' : `Toda la caja pintada (${hex.toUpperCase()})`);
    };

    const btnAssetsPaintAll = document.getElementById('assets-paint-all-btn');
    if (btnAssetsPaintAll) {
      btnAssetsPaintAll.onclick = () => paintAllWithHex(window.StudioColorWheel ? window.StudioColorWheel.getColor() : '#1a242e');
    }
    const btnRblxPaintAll = document.getElementById('rblx-paint-all-btn');
    if (btnRblxPaintAll) {
      btnRblxPaintAll.onclick = () => paintAllWithHex(window.StudioColorWheel ? window.StudioColorWheel.getColor() : '#1a242e');
    }
    const btnAssetsPaintFace = document.getElementById('assets-paint-face-btn');
    if (btnAssetsPaintFace) {
      btnAssetsPaintFace.onclick = () => {
        const f = getActiveFace();
        const hex = window.StudioColorWheel ? window.StudioColorWheel.getColor() : '#1a242e';
        api.pushHistory();
        f.fillColor = hex;
        f.bgColor = hex;
        api.applyFaceMaterial(f);
        api.updateCoverageUI();
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('click');
        api.showToast(`${f.n} pintada (${hex.toUpperCase()})`);
      };
    }
    const btnAssetsPaintKraft = document.getElementById('assets-paint-kraft-btn');
    if (btnAssetsPaintKraft) {
      btnAssetsPaintKraft.onclick = () => paintAllWithHex('kraft');
    }

    // --- ASSETS: Subir imagen a capa ---
    const upImgLayer = document.getElementById('drawer-upload-img-layer');
    if (upImgLayer) {
      upImgLayer.onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        api.loadImageFile(file, img => {
          const f = getActiveFace();
          api.pushHistory();
          window.StudioLayers.ensureFaceLayers(f);
          const lyr = window.StudioLayers.createImageLayer(img, {
            name: file.name.replace(/\.[^.]+$/, ''),
            fitMode: 'cover'
          });
          f.layers.push(lyr);
          window.StudioLayers.extractPaletteFromImage(img, 5);
          selectedLayerId = lyr.id;
          api.applyFaceMaterial(f);
          api.updateCoverageUI();
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
          api.showToast(`Imagen añadida como capa en ${f.n}`);
        });
      };
    }

    // --- ASSETS: Guardar PNG propio en biblioteca IndexedDB ---
    const upCustomPng = document.getElementById('drawer-save-png-lib');
    if (upCustomPng) {
      upCustomPng.onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        api.loadImageFile(file, async img => {
          const rec = {
            id: 'cst_' + Date.now(),
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 22),
            src: img.src,
            tintable: false,
            defaultColor: '#ffffff',
            createdAt: Date.now()
          };
          await api.dbPut(rec, 'stickers');
          activeAssetCat = 'custom';
          await renderAssetsDrawerGrid();
          if (window.StudioAudio) window.StudioAudio.playAction('save');
          api.showToast(`"${rec.name}" guardado en Mis PNGs`);
        });
      };
    }

    // --- ASSETS: Categorías ---
    document.querySelectorAll('.asset-cat-btn').forEach(btn => {
      btn.onclick = () => {
        activeAssetCat = btn.dataset.cat;
        renderAssetsDrawerGrid();
      };
    });

    // --- DISEÑOS GUARDADOS: Guardar actual ---
    const saveBtn = document.getElementById('drawer-save-design-btn');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const nameInp = document.getElementById('drawer-save-name');
        const noteInp = document.getElementById('drawer-save-note');
        const name = (nameInp && nameInp.value.trim()) || `Diseño ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
        const note = (noteInp && noteInp.value.trim()) || '';
        const rec = window.StudioLayers.serializeDesignV3(
          api.getExternalFaces(),
          api.getState(),
          name,
          api.captureThumbnail(),
          { note }
        );
        await api.dbPut(rec, 'designs');
        if (nameInp) nameInp.value = '';
        if (noteInp) noteInp.value = '';
        await renderDesignsDrawerList();
        if (window.StudioAudio) window.StudioAudio.playAction('save');
        api.showToast(`Diseño "${name}" guardado`);
      };
    }

    // --- DISEÑOS GUARDADOS: Buscador ---
    const searchInp = document.getElementById('drawer-designs-search');
    if (searchInp) searchInp.oninput = () => renderDesignsDrawerList();

    // --- DISEÑOS GUARDADOS: Preset Celestial ---
    const celestialBtn = document.getElementById('drawer-apply-celestial');
    if (celestialBtn) {
      celestialBtn.onclick = async () => {
        api.pushHistory();
        await api.loadSkinPack('skins/celestial/skin.json');
        api.getExternalFaces().forEach(window.StudioLayers.ensureFaceLayers);
        if (api.getSelectedFaceKey() === 'all') api.selectFace('front');
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('save');
      };
    }

    // --- DISEÑOS GUARDADOS: Importar JSON ---
    const impJson = document.getElementById('drawer-import-json');
    if (impJson) {
      impJson.onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        const fr = new FileReader();
        fr.onload = async () => {
          try {
            const parsed = JSON.parse(fr.result);
            parsed.id = 'des_' + Date.now();
            parsed.createdAt = Date.now();
            await api.dbPut(parsed, 'designs');
            api.pushHistory();
            await window.StudioLayers.deserializeDesignV3(parsed, api.getExternalFaces(), api.getState(), api.initFaceState);
            api.syncBoxModelUI();
            if (api.getSelectedFaceKey() === 'all') api.selectFace('front');
            await renderDesignsDrawerList();
            refreshAllUI();
            if (window.StudioAudio) window.StudioAudio.playAction('save');
            api.showToast(`Importado: "${parsed.name || 'Diseño'}"`);
          } catch (err) {
            api.showToast('Archivo .fliptop.json inválido');
          }
        };
        fr.readAsText(file);
      };
    }

    // --- TEXTO: Botones de creación rápida ---
    document.querySelectorAll('.add-text-preset').forEach(btn => {
      btn.onclick = () => {
        const f = getActiveFace();
        api.pushHistory();
        window.StudioLayers.ensureFaceLayers(f);
        const lyr = window.StudioLayers.createTextLayer({
          text: btn.dataset.text || 'Tu Texto',
          fontFamily: btn.dataset.font || 'Playfair Display',
          fontSize: parseInt(btn.dataset.size || '16', 10),
          color: btn.dataset.color || '#ffffff',
          strokeEnabled: btn.dataset.stroke !== 'false',
          strokeColor: '#000000',
          strokeWidth: 3
        });
        f.layers.push(lyr);
        selectedLayerId = lyr.id;
        api.applyFaceMaterial(f);
        api.updateCoverageUI();
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('add');
        api.showToast(`Texto añadido a ${f.n}`);
      };
    });

    // --- FONDO: Pintura base + Auto-Diseño ---
    const bgApply = document.getElementById('drawer-bg-apply');
    if (bgApply) {
      bgApply.onclick = () => applyStudioBackground(document.getElementById('drawer-bg-color').value);
    }
    document.querySelectorAll('.drawer-bg-swatch').forEach(btn => {
      btn.onclick = () => {
        const v = btn.dataset.swatch;
        if (v !== 'kraft') document.getElementById('drawer-bg-color').value = v;
        applyStudioBackground(v);
      };
    });
    const drawerAll = document.getElementById('drawer-cover-all');
    if (drawerAll) {
      drawerAll.onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        api.loadImageFile(file, img => {
          api.pushHistory();
          window.StudioLayers.extractPaletteFromImage(img, 5);
          const active = api.getActiveExternalFaces();
          active.forEach(f => {
            window.StudioLayers.ensureFaceLayers(f);
            f.layers = [window.StudioLayers.createImageLayer(img, { name: file.name.replace(/\.[^.]+$/, ''), fitMode: 'cover' })];
            f.fillColor = null;
            api.applyFaceMaterial(f);
          });
          api.updateCoverageUI();
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
          api.showToast(`${active.length} caras cubiertas`);
        });
      };
    }
    const drawerWrap = document.getElementById('drawer-cover-wrap');
    if (drawerWrap) {
      drawerWrap.onchange = e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        api.loadImageFile(file, img => {
          api.pushHistory();
          window.StudioLayers.extractPaletteFromImage(img, 5);
          const active = api.getActiveExternalFaces();
          active.forEach(f => {
            window.StudioLayers.ensureFaceLayers(f);
            f.layers = [window.StudioLayers.createImageLayer(img, { name: 'Envoltura', fitMode: 'cover', crop: f.wrap })];
            f.fillColor = null;
            api.applyFaceMaterial(f);
          });
          api.updateCoverageUI();
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
          api.showToast('Envoltura continua aplicada');
        });
      };
    }

    // --- MODELO: Con/Sin Encendedor + Ventana ---
    const mWith = document.getElementById('drawer-model-with');
    const mNo = document.getElementById('drawer-model-no');
    const mWin = document.getElementById('drawer-model-win');
    if (mWith) mWith.onclick = () => { api.getState().hasPocket = true; api.syncBoxModelUI(); refreshAllUI(); };
    if (mNo) mNo.onclick = () => { api.getState().hasPocket = false; api.syncBoxModelUI(); refreshAllUI(); };
    if (mWin) mWin.onchange = e => { api.getState().hasWindow = e.target.checked; api.syncBoxModelUI(); refreshAllUI(); };
  }

  function applyStudioBackground(colorVal) {
    const scope = document.getElementById('drawer-bg-scope').value;
    const isKraft = colorVal === 'kraft';
    api.pushHistory();

    if (scope === 'inner') {
      api.getState().innerCustomColor = !isKraft;
      if (!isKraft) api.getState().innerColorHex = colorVal;
      api.refreshAllMaterials();
      refreshAllUI();
      if (window.StudioAudio) window.StudioAudio.playAction('click');
      api.showToast(isKraft ? 'Interior restaurado a kraft' : `Interior pintado (${colorVal})`);
      return;
    }

    const active = api.getActiveExternalFaces();
    let targets = active;
    if (scope === 'selected') targets = [getActiveFace()];
    else if (scope === 'A') targets = active.filter(f => f.side === 'A');
    else if (scope === 'B') targets = active.filter(f => f.side === 'B');

    targets.forEach(f => {
      f.fillColor = isKraft ? null : colorVal;
      if (!isKraft) f.bgColor = colorVal;
      api.applyFaceMaterial(f);
    });
    api.updateCoverageUI();
    refreshAllUI();
    if (window.StudioAudio) window.StudioAudio.playAction('click');
    api.showToast(isKraft ? 'Fondo restaurado a cartón kraft' : `Fondo aplicado (${targets.length} cara${targets.length === 1 ? '' : 's'})`);
  }

  function setDrawer(name) {
    activeDrawer = name;
    const drawerEl = document.getElementById('studio-left-drawer');
    const titleEl = document.getElementById('drawer-title');
    if (!drawerEl) return;

    drawerEl.classList.toggle('hidden', !name || appMode !== 'studio');
    document.querySelectorAll('.dock-btn').forEach(btn => {
      const active = btn.dataset.drawer === name;
      btn.className = `dock-btn flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-xl text-[10px] font-semibold transition ${
        active
          ? 'bg-amber-600 text-white shadow-sm'
          : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-200/80 dark:hover:bg-zinc-800 hover:text-stone-900 dark:hover:text-zinc-100'
      }`;
    });

    const titles = {
      assets: 'Assets e Imágenes',
      designs: 'Diseños Guardados',
      text: 'Texto y Tipografía',
      bg: 'Fondo y Paleta',
      model: 'Modelo y Caras'
    };
    if (titleEl && name) {
      const iconMap = { assets: 'dock-assets', designs: 'dock-designs', text: 'dock-text', bg: 'dock-bg', model: 'dock-model' };
      const svgIc = window.StudioIcons ? window.StudioIcons.svg(iconMap[name], 'w-4 h-4 text-amber-600 dark:text-amber-400') : '';
      titleEl.innerHTML = `<span class="flex items-center gap-1.5">${svgIc}<span>${titles[name] || ''}</span></span>`;
    }

    document.querySelectorAll('.drawer-pane').forEach(p => {
      p.classList.toggle('hidden', p.id !== `drawer-pane-${name}`);
    });

    if (name === 'assets') renderAssetsDrawerGrid();
    if (name === 'designs') renderDesignsDrawerList();
    if (name === 'bg') renderAutoPaletteSwatches();
    if (name === 'model') renderDrawerFacesList();

    requestAnimationFrame(() => {
      if (window.StudioCanvas) window.StudioCanvas.resize();
    });
  }

  async function renderAssetsDrawerGrid() {
    const grid = document.getElementById('drawer-assets-grid');
    if (!grid) return;

    document.querySelectorAll('.asset-cat-btn').forEach(b => {
      const active = b.dataset.cat === activeAssetCat;
      b.className = `asset-cat-btn px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
        active
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-stone-200/70 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-300/70 dark:hover:bg-zinc-700'
      }`;
    });

    const list = await api.getStickerCategoryItems(activeAssetCat);
    if (!list.length) {
      grid.innerHTML = `<div class="col-span-2 text-center py-6 text-[11px] text-stone-400 dark:text-zinc-500">Sin assets en esta categoría.</div>`;
      return;
    }

    grid.innerHTML = '';
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'group relative rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-100/80 dark:bg-zinc-800/80 hover:border-amber-500 p-2 flex flex-col items-center gap-1.5 cursor-pointer transition';
      card.innerHTML = `
        <div class="w-full h-16 rounded-lg bg-zinc-900/90 flex items-center justify-center p-1.5 overflow-hidden">
          <img src="${item.src}" alt="${item.name}" class="max-w-full max-h-full object-contain group-hover:scale-105 transition" />
        </div>
        <span class="text-[10px] font-semibold text-stone-700 dark:text-zinc-200 text-center truncate w-full">${item.name}</span>
        ${activeAssetCat === 'custom' ? `<button type="button" class="ast-del absolute top-1 right-1 w-4 h-4 rounded bg-black/70 hover:bg-red-600 text-white text-[9px]">✕</button>` : ''}
      `;
      card.onclick = e => {
        if (e.target.classList.contains('ast-del')) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const f = getActiveFace();
          api.pushHistory();
          window.StudioLayers.ensureFaceLayers(f);
          const lyr = window.StudioLayers.createStickerLayer(img, {
            name: item.name,
            scale: 52,
            tintEnabled: !!item.tintable,
            tintColor: item.defaultColor || '#caa368'
          });
          f.layers.push(lyr);
          selectedLayerId = lyr.id;
          api.applyFaceMaterial(f);
          api.updateCoverageUI();
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
          api.showToast(`"${item.name}" añadido a ${f.n}`);
        };
        img.src = item.src;
      };
      if (activeAssetCat === 'custom') {
        card.querySelector('.ast-del').onclick = async () => {
          await api.dbDelete(item.id, 'stickers');
          renderAssetsDrawerGrid();
          api.showToast('PNG eliminado');
        };
      }
      grid.appendChild(card);
    });
  }

  async function renderDesignsDrawerList() {
    const listEl = document.getElementById('drawer-designs-list');
    const countEl = document.getElementById('drawer-designs-count');
    const searchVal = (document.getElementById('drawer-designs-search')?.value || '').trim().toLowerCase();
    if (!listEl) return;

    let items = [];
    try { items = await api.dbGetAll('designs'); } catch (e) {}
    if (searchVal) {
      items = items.filter(it =>
        (it.name || '').toLowerCase().includes(searchVal) ||
        (it.note || '').toLowerCase().includes(searchVal)
      );
    }
    if (countEl) countEl.textContent = `${items.length}`;

    if (!items.length) {
      listEl.innerHTML = `<div class="text-center py-5 px-3 rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 text-[11px] text-stone-400 dark:text-zinc-500">Sin diseños guardados aún. Guarda el actual arriba para reutilizarlo rápido.</div>`;
      return;
    }

    listEl.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'rounded-xl border border-stone-200 dark:border-zinc-700/80 bg-stone-50 dark:bg-zinc-800/60 overflow-hidden shadow-sm';
      const dateStr = new Date(item.createdAt || Date.now()).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
      card.innerHTML = `
        <div class="h-24 bg-stone-200 dark:bg-zinc-950 flex items-center justify-center overflow-hidden relative">
          ${item.thumbnail ? `<img src="${item.thumbnail}" class="w-full h-full object-cover" />` : `<span class="text-[10px] text-stone-400">Sin miniatura</span>`}
          <span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-medium">${dateStr}</span>
        </div>
        <div class="p-2 space-y-1.5">
          <div class="text-xs font-bold text-stone-800 dark:text-zinc-100 truncate">${item.name || 'Diseño'}</div>
          ${item.note ? `<div class="text-[10px] text-stone-500 dark:text-zinc-400 truncate">${item.note}</div>` : ''}
          <div class="flex items-center gap-1">
            <button class="d-load flex-1 text-[10px] font-semibold py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition">Cargar</button>
            <button class="d-exp text-[10px] px-2 py-1 rounded-lg bg-stone-200 dark:bg-zinc-700 hover:bg-stone-300 dark:hover:bg-zinc-600 text-stone-700 dark:text-zinc-200" title="Exportar .fliptop.json">⬇</button>
            <button class="d-del text-[10px] px-2 py-1 rounded-lg bg-stone-200 dark:bg-zinc-700 hover:bg-red-500 hover:text-white text-stone-600 dark:text-zinc-300" title="Eliminar">✕</button>
          </div>
        </div>
      `;
      card.querySelector('.d-load').onclick = async () => {
        api.pushHistory();
        await window.StudioLayers.deserializeDesignV3(item, api.getExternalFaces(), api.getState(), api.initFaceState);
        api.syncBoxModelUI();
        if (api.getSelectedFaceKey() === 'all') api.selectFace('front');
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('save');
        api.showToast(`Cargado: "${item.name}"`);
      };
      card.querySelector('.d-exp').onclick = () => {
        const blob = new Blob([JSON.stringify(item)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${(item.name || 'diseno').replace(/[^a-z0-9_-]/gi, '_')}.fliptop.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };
      card.querySelector('.d-del').onclick = async () => {
        await api.dbDelete(item.id, 'designs');
        renderDesignsDrawerList();
        if (window.StudioAudio) window.StudioAudio.playAction('delete');
      };
      listEl.appendChild(card);
    });
  }

  function renderAutoPaletteSwatches() {
    const wrap = document.getElementById('drawer-auto-palette');
    if (!wrap) return;
    const colors = window.StudioLayers.getLastPalette();
    wrap.innerHTML = '';
    colors.forEach(hex => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-7 h-7 rounded-lg border border-stone-300 dark:border-zinc-600 hover:scale-110 transition shadow-sm';
      b.style.backgroundColor = hex;
      b.title = `Aplicar ${hex}`;
      b.onclick = () => {
        document.getElementById('drawer-bg-color').value = hex;
        applyStudioBackground(hex);
      };
      wrap.appendChild(b);
    });
  }

  function renderDrawerFacesList() {
    const list = document.getElementById('drawer-faces-list');
    if (!list) return;
    const activeFaces = api.getActiveExternalFaces();
    const curKey = getActiveFace().k;
    const st = api.getState();

    const mWith = document.getElementById('drawer-model-with');
    const mNo = document.getElementById('drawer-model-no');
    const mWin = document.getElementById('drawer-model-win');
    const activeCls = 'py-1.5 px-2 rounded-lg border border-amber-600 bg-amber-600 text-white text-[11px] font-semibold';
    const idleCls = 'py-1.5 px-2 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 text-[11px] font-semibold';
    if (mWith) mWith.className = st.hasPocket ? activeCls : idleCls;
    if (mNo) mNo.className = !st.hasPocket ? activeCls : idleCls;
    if (mWin) mWin.checked = !!st.hasWindow;

    list.innerHTML = '';
    activeFaces.forEach(f => {
      window.StudioLayers.ensureFaceLayers(f);
      const isCur = f.k === curKey;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-[11px] transition border ${
        isCur
          ? 'border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-300 font-bold'
          : 'border-transparent hover:bg-stone-200/60 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-200'
      }`;
      const badgeCls = f.side === 'A' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
      row.innerHTML = `
        <span class="truncate">${f.n}</span>
        <span class="flex items-center gap-1 shrink-0">
          <span class="text-[9px] px-1.5 py-0.5 rounded ${badgeCls}">${f.side}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-zinc-700 text-stone-600 dark:text-zinc-300">${f.layers.length}</span>
        </span>
      `;
      row.onclick = () => {
        api.selectFace(f.k);
        selectedLayerId = f.layers.length ? f.layers[f.layers.length - 1].id : null;
        refreshAllUI();
      };
      list.appendChild(row);
    });
  }

  // =========================================================================
  // 3. TOOLBAR DEL LIENZO CENTRAL
  // =========================================================================
  function setupStudioToolbar() {
    const faceSel = document.getElementById('studio-face-select');
    if (faceSel) {
      faceSel.onchange = e => {
        api.selectFace(e.target.value);
        const f = getActiveFace();
        window.StudioLayers.ensureFaceLayers(f);
        selectedLayerId = f.layers.length ? f.layers[f.layers.length - 1].id : null;
        refreshAllUI();
      };
    }

    document.querySelectorAll('.canvas-submode-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.StudioAudio) window.StudioAudio.playAction('click');
        applyStudioSubMode(btn.dataset.submode);
      };
    });

    const snapBtn = document.getElementById('studio-snap-btn');
    if (snapBtn) {
      snapBtn.onclick = () => {
        window.StudioCanvas.state.snapEnabled = !window.StudioCanvas.state.snapEnabled;
        syncCanvasToolbarButtons();
        if (window.StudioAudio) window.StudioAudio.playAction('click');
      };
    }

    const guidesBtn = document.getElementById('studio-guides-btn');
    if (guidesBtn) {
      guidesBtn.onclick = () => {
        window.StudioCanvas.state.guidesEnabled = !window.StudioCanvas.state.guidesEnabled;
        syncCanvasToolbarButtons();
        window.StudioCanvas.render();
      };
    }

    const zIn = document.getElementById('studio-zoom-in');
    const zOut = document.getElementById('studio-zoom-out');
    const zReset = document.getElementById('studio-zoom-reset');
    if (zIn) zIn.onclick = () => window.StudioCanvas.zoomBy(1.18);
    if (zOut) zOut.onclick = () => window.StudioCanvas.zoomBy(0.84);
    if (zReset) zReset.onclick = () => window.StudioCanvas.resetZoom();
  }

  function applyStudioSubMode(submode) {
    studioSubMode = submode;
    const focusWrap = document.getElementById('studio-focus-wrap');
    const diecutWrap = document.getElementById('canvas2d-wrap');
    const edit3dWrap = document.getElementById('studio-3d-edit-wrap');
    const pipBox = document.getElementById('studio-pip-3d');

    if (submode === 'edit3d') {
      if (focusWrap) focusWrap.classList.add('hidden');
      if (diecutWrap) diecutWrap.classList.add('hidden');
      if (edit3dWrap) { edit3dWrap.classList.remove('hidden'); edit3dWrap.classList.add('flex'); }
      if (pipBox) pipBox.classList.add('hidden');
      mount3DCanvasInto('studio-3d-edit-host');
      if (window.Studio3DEdit) window.Studio3DEdit.setActive(true);
    } else {
      if (edit3dWrap) { edit3dWrap.classList.add('hidden'); edit3dWrap.classList.remove('flex'); }
      if (pipBox) pipBox.classList.remove('hidden');
      if (window.Studio3DEdit) window.Studio3DEdit.setActive(false);
      mount3DCanvasInto('studio-pip-3d-body');
      if (submode === 'continuous') api.selectFace('front');
      if (window.StudioCanvas) window.StudioCanvas.setMode(submode);
    }
    syncCanvasToolbarButtons();
    requestAnimationFrame(() => api.onViewportResize());
  }

  function syncCanvasToolbarButtons() {
    const m = studioSubMode;
    document.querySelectorAll('.canvas-submode-btn').forEach(btn => {
      const active = btn.dataset.submode === m;
      btn.className = `canvas-submode-btn flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition ${
        active
          ? 'bg-white dark:bg-zinc-900 text-amber-800 dark:text-amber-300 shadow-sm'
          : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
      }`;
    });

    const snapBtn = document.getElementById('studio-snap-btn');
    if (snapBtn) {
      const on = window.StudioCanvas.state.snapEnabled;
      snapBtn.className = `flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border transition ${
        on
          ? 'border-pink-500/40 bg-pink-500/15 text-pink-700 dark:text-pink-300'
          : 'border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 text-stone-500'
      }`;
    }

    const guidesBtn = document.getElementById('studio-guides-btn');
    if (guidesBtn) {
      const on = window.StudioCanvas.state.guidesEnabled;
      guidesBtn.className = `flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border transition ${
        on
          ? 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300'
          : 'border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 text-stone-500'
      }`;
    }
  }

  function syncFaceSelectDropdown() {
    const sel = document.getElementById('studio-face-select');
    if (!sel) return;
    const active = api.getActiveExternalFaces();
    const cur = getActiveFace();
    sel.innerHTML = active.map(f => `<option value="${f.k}">[${f.side}] ${f.n} (${f.w}×${f.h})</option>`).join('');
    sel.value = cur.k;
  }

  // =========================================================================
  // 4. PANEL DERECHO: CAPAS + INSPECTOR CONTEXTUAL
  // =========================================================================
  function setupRightPanel() {
    const addTxt = document.getElementById('layers-quick-add-text');
    if (addTxt) {
      addTxt.onclick = () => {
        const f = getActiveFace();
        api.pushHistory();
        window.StudioLayers.ensureFaceLayers(f);
        const lyr = window.StudioLayers.createTextLayer({ text: 'Nuevo Texto' });
        f.layers.push(lyr);
        selectedLayerId = lyr.id;
        api.applyFaceMaterial(f);
        api.updateCoverageUI();
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('add');
      };
    }

    const addAsset = document.getElementById('layers-quick-add-asset');
    if (addAsset) {
      addAsset.onclick = () => setDrawer('assets');
    }

    const clearFace = document.getElementById('layers-clear-face');
    if (clearFace) {
      clearFace.onclick = () => {
        const f = getActiveFace();
        api.pushHistory();
        f.layers = [];
        f.img = null; f.overlays = []; f.fillColor = null;
        selectedLayerId = null;
        api.applyFaceMaterial(f);
        api.updateCoverageUI();
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('delete');
        api.showToast(`${f.n} limpiada`);
      };
    }
  }

  function renderLayersPanel() {
    const listEl = document.getElementById('studio-layers-list');
    const countBadge = document.getElementById('studio-layers-count');
    if (!listEl) return;

    const f = getActiveFace();
    window.StudioLayers.ensureFaceLayers(f);

    if (countBadge) countBadge.textContent = f.layers.length;

    if (selectedLayerId && !f.layers.some(l => l.id === selectedLayerId)) {
      selectedLayerId = f.layers.length ? f.layers[f.layers.length - 1].id : null;
    }

    listEl.innerHTML = '';

    if (f.layers.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-5 px-3 rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 text-[11px] text-stone-400 dark:text-zinc-500">
          Sin capas en <strong>${f.n}</strong>.<br/>Añade una imagen, sticker o texto desde la izquierda.
        </div>`;
    } else {
      // Mostrar de arriba hacia abajo (capa superior primero, estilo Photoshop/Figma)
      const ic = (name, sz = 'w-4 h-4') => window.StudioIcons ? window.StudioIcons.svg(name, sz) : '';
      for (let i = f.layers.length - 1; i >= 0; i--) {
        const lyr = f.layers[i];
        const isSel = lyr.id === selectedLayerId;
        const typeIcon = ic(lyr.type === 'text' ? 'lyr-text' : (lyr.type === 'sticker' ? 'lyr-sticker' : 'lyr-image'), 'w-4 h-4 text-amber-600 dark:text-amber-400');

        const row = document.createElement('div');
        row.draggable = true;
        row.dataset.index = i;
        row.className = `group flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] cursor-pointer transition ${
          isSel
            ? 'border-amber-500 bg-amber-500/15 text-stone-900 dark:text-zinc-50'
            : 'border-stone-200/80 dark:border-zinc-700/80 bg-stone-50/80 dark:bg-zinc-800/50 hover:border-stone-300 dark:hover:border-zinc-600 text-stone-700 dark:text-zinc-300'
        } ${lyr.visible === false ? 'opacity-50' : ''}`;

        row.innerHTML = `
          <span class="cursor-grab text-stone-400 dark:text-zinc-500" title="Arrastrar para reordenar">${ic('grip', 'w-3.5 h-3.5')}</span>
          <span class="shrink-0">${typeIcon}</span>
          <span class="flex-1 truncate font-medium">${lyr.type === 'text' ? (lyr.text || 'Texto') : (lyr.name || 'Capa')}</span>
          <button type="button" class="lyr-vis p-1 rounded hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-500 dark:text-zinc-400" title="Mostrar/Ocultar">${ic(lyr.visible === false ? 'eye-off' : 'eye', 'w-4 h-4')}</button>
          <button type="button" class="lyr-lock p-1 rounded hover:bg-stone-200 dark:hover:bg-zinc-700 ${lyr.locked ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-zinc-500'}" title="Bloquear">${ic(lyr.locked ? 'lock' : 'unlock', 'w-4 h-4')}</button>
          <button type="button" class="lyr-dup p-1 rounded hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-500 dark:text-zinc-400" title="Duplicar">${ic('duplicate', 'w-4 h-4')}</button>
          <button type="button" class="lyr-del p-1 rounded hover:bg-red-500 hover:text-white text-stone-400 dark:text-zinc-500" title="Eliminar">${ic('trash', 'w-4 h-4')}</button>
        `;

        row.onclick = e => {
          if (e.target.closest('button')) return;
          selectLayer(lyr.id);
        };

        row.querySelector('.lyr-vis').onclick = () => {
          api.pushHistory();
          lyr.visible = lyr.visible === false ? true : false;
          api.applyFaceMaterial(f);
          refreshAllUI();
        };
        row.querySelector('.lyr-lock').onclick = () => {
          lyr.locked = !lyr.locked;
          refreshAllUI();
        };
        row.querySelector('.lyr-dup').onclick = () => {
          api.pushHistory();
          const clone = { ...lyr, id: window.StudioLayers.genId(lyr.type), x: (lyr.x || 0) + 5, y: (lyr.y || 0) - 5, name: `${lyr.name} copia` };
          f.layers.splice(i + 1, 0, clone);
          selectedLayerId = clone.id;
          api.applyFaceMaterial(f);
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
        };
        row.querySelector('.lyr-del').onclick = () => {
          api.pushHistory();
          f.layers.splice(i, 1);
          if (selectedLayerId === lyr.id) selectedLayerId = f.layers.length ? f.layers[f.layers.length - 1].id : null;
          api.applyFaceMaterial(f);
          api.updateCoverageUI();
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('delete');
        };

        // Drag & drop para reordenar Z-index
        row.addEventListener('dragstart', () => { dragLayerIdx = i; row.classList.add('opacity-40'); });
        row.addEventListener('dragend', () => { dragLayerIdx = null; row.classList.remove('opacity-40'); });
        row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('ring-1', 'ring-amber-500'); });
        row.addEventListener('dragleave', () => row.classList.remove('ring-1', 'ring-amber-500'));
        row.addEventListener('drop', e => {
          e.preventDefault();
          row.classList.remove('ring-1', 'ring-amber-500');
          if (dragLayerIdx === null || dragLayerIdx === i) return;
          api.pushHistory();
          const [moved] = f.layers.splice(dragLayerIdx, 1);
          f.layers.splice(i, 0, moved);
          api.applyFaceMaterial(f);
          refreshAllUI();
          if (window.StudioAudio) window.StudioAudio.playAction('click');
        });

        listEl.appendChild(row);
      }
    }

    // Fila fija de Capa Base (Fondo)
    const bgRow = document.createElement('div');
    bgRow.className = 'mt-1.5 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-stone-200/60 dark:border-zinc-800 bg-stone-100/70 dark:bg-zinc-900/60 text-[10px] text-stone-500 dark:text-zinc-400 cursor-pointer hover:border-amber-500/50 transition';
    bgRow.innerHTML = `
      <span class="flex items-center gap-1.5">
        <span class="w-3.5 h-3.5 rounded border border-stone-400/50 inline-block" style="background:${f.fillColor || '#d4a373'}"></span>
        <span>Fondo base (${f.fillColor || 'Cartón Kraft'})</span>
      </span>
      <span class="text-[9px] text-amber-600 dark:text-amber-400 font-semibold">Editar</span>
    `;
    bgRow.onclick = () => setDrawer('bg');
    listEl.appendChild(bgRow);
  }

  function renderInspectorPanel() {
    const box = document.getElementById('studio-inspector-body');
    if (!box) return;

    const f = getActiveFace();
    const lyr = getSelectedLayer();

    if (!lyr) {
      box.innerHTML = `<div class="text-[11px] text-stone-400 dark:text-zinc-500 py-4 text-center">Selecciona una capa arriba o haz clic en el lienzo para ajustar sus propiedades.</div>`;
      return;
    }

    const minS = lyr.type === 'sticker' ? 5 : 10;
    const maxS = 300;

    let extraHtml = '';
    if (lyr.type === 'text') {
      const opts = FONT_OPTIONS.map(fn => `<option value="${fn}" ${lyr.fontFamily === fn ? 'selected' : ''}>${fn}</option>`).join('');
      extraHtml = `
        <div class="space-y-2 pb-2 border-b border-stone-200 dark:border-zinc-700/80">
          <textarea id="ins-text-val" rows="2" class="w-full text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-stone-800 dark:text-zinc-100" placeholder="Escribe tu texto...">${lyr.text || ''}</textarea>
          <select id="ins-text-font" class="w-full text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-stone-800 dark:text-zinc-100">${opts}</select>
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <label class="flex items-center gap-1.5"><span>Color</span><input id="ins-text-color" type="color" value="${lyr.color || '#ffffff'}" class="w-6 h-5 rounded cursor-pointer bg-transparent" /></label>
            <label class="flex items-center gap-1.5 cursor-pointer"><input id="ins-text-stroke" type="checkbox" ${lyr.strokeEnabled ? 'checked' : ''} class="accent-amber-600" /><span>Borde</span></label>
            <input id="ins-text-scolor" type="color" value="${lyr.strokeColor || '#000000'}" class="w-6 h-5 rounded cursor-pointer bg-transparent" />
            <label class="flex items-center gap-1 cursor-pointer"><input id="ins-text-shadow" type="checkbox" ${lyr.shadowEnabled ? 'checked' : ''} class="accent-amber-600" /><span>Sombra</span></label>
          </div>
        </div>
      `;
    } else if (lyr.type === 'sticker') {
      extraHtml = `
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-stone-200 dark:border-zinc-700/80 text-[11px]">
          <label class="flex items-center gap-1.5 cursor-pointer font-medium">
            <input id="ins-st-tint" type="checkbox" ${lyr.tintEnabled ? 'checked' : ''} class="w-3.5 h-3.5 accent-amber-600 rounded" />
            <span>Recolorear</span>
          </label>
          <div class="flex items-center gap-1">
            <button data-c="#ffffff" class="ins-sw w-4 h-4 rounded-full border border-stone-400 bg-white"></button>
            <button data-c="#caa368" class="ins-sw w-4 h-4 rounded-full border border-stone-400 bg-[#caa368]"></button>
            <button data-c="#84cc16" class="ins-sw w-4 h-4 rounded-full border border-stone-400 bg-[#84cc16]"></button>
            <button data-c="#ef4444" class="ins-sw w-4 h-4 rounded-full border border-stone-400 bg-[#ef4444]"></button>
            <input id="ins-st-color" type="color" value="${lyr.tintColor || '#caa368'}" class="w-6 h-5 rounded cursor-pointer bg-transparent" />
          </div>
        </div>
      `;
    }

    box.innerHTML = `
      ${extraHtml}
      <div class="space-y-2 text-[11px] text-stone-600 dark:text-zinc-400">
        <label class="block">
          <div class="flex justify-between"><span>Tamaño / Escala</span><span id="ins-scale-v" class="font-bold text-amber-700 dark:text-amber-300">${Math.round(lyr.scale)}%</span></div>
          <input id="ins-scale" type="range" min="${minS}" max="${maxS}" step="1" value="${Math.round(lyr.scale)}" class="w-full" />
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="block">
            <div class="flex justify-between"><span>Pos X</span><span id="ins-x-v">${Math.round(lyr.x)}</span></div>
            <input id="ins-x" type="range" min="-100" max="100" step="1" value="${Math.round(lyr.x)}" class="w-full" />
          </label>
          <label class="block">
            <div class="flex justify-between"><span>Pos Y</span><span id="ins-y-v">${Math.round(lyr.y)}</span></div>
            <input id="ins-y" type="range" min="-100" max="100" step="1" value="${Math.round(lyr.y)}" class="w-full" />
          </label>
        </div>
        <label class="block">
          <div class="flex justify-between"><span>Rotación</span><span id="ins-rot-v">${Math.round(lyr.rot || 0)}°</span></div>
          <input id="ins-rot" type="range" min="-180" max="180" step="1" value="${Math.round(lyr.rot || 0)}" class="w-full" />
        </label>
        <label class="block">
          <div class="flex justify-between"><span>Opacidad</span><span id="ins-op-v">${Math.round((lyr.opacity ?? 1) * 100)}%</span></div>
          <input id="ins-op" type="range" min="5" max="100" step="1" value="${Math.round((lyr.opacity ?? 1) * 100)}" class="w-full" />
        </label>
        <div class="grid grid-cols-4 gap-1 pt-1">
          <button id="ins-center" class="py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-[10px] font-semibold" title="Centrar en cara">⌖ Centro</button>
          <button id="ins-fh" class="py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-[10px] font-semibold" title="Voltear horizontal">⇋ H</button>
          <button id="ins-fv" class="py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-[10px] font-semibold" title="Voltear vertical">⇅ V</button>
          <button id="ins-rot90" class="py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-[10px] font-semibold" title="Girar +90°">↻ 90°</button>
        </div>
      </div>
    `;

    const applyUpdate = () => {
      api.applyFaceMaterial(f);
      if (window.StudioCanvas && studioSubMode !== 'edit3d') window.StudioCanvas.render();
      if (window.Studio3DEdit && studioSubMode === 'edit3d') window.Studio3DEdit.rebuildGizmo();
    };

    // Eventos de Escala con SONIDO DINÁMICO ("dots" subiendo/bajando tono)
    const sSlider = document.getElementById('ins-scale');
    sSlider.onmousedown = () => { api.pushHistory(); window.StudioAudio.resetScaleTracker(lyr.scale); };
    sSlider.oninput = e => {
      const val = +e.target.value;
      lyr.scale = val;
      document.getElementById('ins-scale-v').textContent = `${val}%`;
      if (window.StudioAudio) window.StudioAudio.onScaleChange(val, minS, maxS, 2);
      applyUpdate();
    };

    const xSlider = document.getElementById('ins-x');
    xSlider.onmousedown = () => api.pushHistory();
    xSlider.oninput = e => { lyr.x = +e.target.value; document.getElementById('ins-x-v').textContent = lyr.x; applyUpdate(); };

    const ySlider = document.getElementById('ins-y');
    ySlider.onmousedown = () => api.pushHistory();
    ySlider.oninput = e => { lyr.y = +e.target.value; document.getElementById('ins-y-v').textContent = lyr.y; applyUpdate(); };

    const rSlider = document.getElementById('ins-rot');
    rSlider.onmousedown = () => { api.pushHistory(); window.StudioAudio.resetRotateTracker(lyr.rot || 0); };
    rSlider.oninput = e => {
      lyr.rot = +e.target.value;
      document.getElementById('ins-rot-v').textContent = `${lyr.rot}°`;
      if (window.StudioAudio) window.StudioAudio.onRotateChange(lyr.rot, 6);
      applyUpdate();
    };

    const oSlider = document.getElementById('ins-op');
    oSlider.onmousedown = () => api.pushHistory();
    oSlider.oninput = e => {
      lyr.opacity = (+e.target.value) / 100;
      document.getElementById('ins-op-v').textContent = `${e.target.value}%`;
      applyUpdate();
    };

    document.getElementById('ins-center').onclick = () => {
      api.pushHistory();
      lyr.x = 0; lyr.y = 0;
      if (window.StudioAudio) window.StudioAudio.playSnap();
      applyUpdate();
      renderInspectorPanel();
    };
    document.getElementById('ins-fh').onclick = () => { api.pushHistory(); lyr.fh = !lyr.fh; applyUpdate(); };
    document.getElementById('ins-fv').onclick = () => { api.pushHistory(); lyr.fv = !lyr.fv; applyUpdate(); };
    document.getElementById('ins-rot90').onclick = () => {
      api.pushHistory();
      lyr.rot = (((lyr.rot || 0) + 90 + 180) % 360) - 180;
      if (window.StudioAudio) window.StudioAudio.playSnap();
      applyUpdate();
      renderInspectorPanel();
    };

    if (lyr.type === 'text') {
      document.getElementById('ins-text-val').oninput = e => { lyr.text = e.target.value; lyr.name = lyr.text.slice(0, 22); applyUpdate(); renderLayersPanel(); };
      document.getElementById('ins-text-font').onchange = e => { api.pushHistory(); lyr.fontFamily = e.target.value; applyUpdate(); };
      document.getElementById('ins-text-color').oninput = e => { lyr.color = e.target.value; applyUpdate(); };
      document.getElementById('ins-text-stroke').onchange = e => { lyr.strokeEnabled = e.target.checked; applyUpdate(); };
      document.getElementById('ins-text-scolor').oninput = e => { lyr.strokeColor = e.target.value; lyr.strokeEnabled = true; applyUpdate(); };
      document.getElementById('ins-text-shadow').onchange = e => { lyr.shadowEnabled = e.target.checked; applyUpdate(); };
    } else if (lyr.type === 'sticker') {
      document.getElementById('ins-st-tint').onchange = e => { lyr.tintEnabled = e.target.checked; applyUpdate(); };
      document.getElementById('ins-st-color').oninput = e => { lyr.tintColor = e.target.value; lyr.tintEnabled = true; document.getElementById('ins-st-tint').checked = true; applyUpdate(); };
      box.querySelectorAll('.ins-sw').forEach(b => {
        b.onclick = () => { lyr.tintColor = b.dataset.c; lyr.tintEnabled = true; renderInspectorPanel(); applyUpdate(); };
      });
    }
  }

  // =========================================================================
  // 5. MINI-3D FLOTANTE (PiP) Y ATAJOS DE TECLADO
  // =========================================================================
  function setupPiPControls() {
    const toggleBtn = document.getElementById('pip-toggle-btn');
    const expandBtn = document.getElementById('pip-expand-btn');
    const body = document.getElementById('studio-pip-3d-body');
    const box = document.getElementById('studio-pip-3d');

    if (toggleBtn && body && box) {
      toggleBtn.onclick = () => {
        pipCollapsed = !pipCollapsed;
        body.classList.toggle('hidden', pipCollapsed);
        box.style.width = pipCollapsed ? '145px' : '240px';
        toggleBtn.textContent = pipCollapsed ? '▲' : '▼';
        requestAnimationFrame(() => api.onViewportResize());
      };
    }
    if (expandBtn) {
      expandBtn.onclick = () => setAppMode('3d');
    }
  }

  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', e => {
      if (appMode !== 'studio') return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
        return;
      }

      const f = getActiveFace();
      const lyr = getSelectedLayer();
      if (!lyr || lyr.locked) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        api.pushHistory();
        const clone = { ...lyr, id: window.StudioLayers.genId(lyr.type), x: (lyr.x || 0) + 5, y: (lyr.y || 0) - 5, name: `${lyr.name} copia` };
        f.layers.push(clone);
        selectedLayerId = clone.id;
        api.applyFaceMaterial(f);
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('add');
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        api.pushHistory();
        f.layers = f.layers.filter(l => l.id !== lyr.id);
        selectedLayerId = f.layers.length ? f.layers[f.layers.length - 1].id : null;
        api.applyFaceMaterial(f);
        api.updateCoverageUI();
        refreshAllUI();
        if (window.StudioAudio) window.StudioAudio.playAction('delete');
        return;
      }

      const step = e.shiftKey ? 0.5 : 2;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') lyr.x = Math.max(-100, lyr.x - step);
        if (e.key === 'ArrowRight') lyr.x = Math.min(100, lyr.x + step);
        if (e.key === 'ArrowUp') lyr.y = Math.min(100, lyr.y + step);
        if (e.key === 'ArrowDown') lyr.y = Math.max(-100, lyr.y - step);
        api.applyFaceMaterial(f);
        if (window.StudioCanvas) window.StudioCanvas.render();
        renderInspectorPanel();
      }
    });
  }

  function refreshAllUI() {
    syncFaceSelectDropdown();
    syncCanvasToolbarButtons();
    renderLayersPanel();
    renderInspectorPanel();
    if (activeDrawer === 'bg') renderAutoPaletteSwatches();
    if (activeDrawer === 'model') renderDrawerFacesList();
    if (window.StudioCanvas && studioSubMode !== 'edit3d') window.StudioCanvas.render();
    if (window.Studio3DEdit) {
      window.Studio3DEdit.syncOverlayUI();
      if (studioSubMode === 'edit3d') window.Studio3DEdit.rebuildGizmo();
    }
  }

  function onExternalFaceMutated(faces, skipInspectorRebuild = false) {
    faces.forEach(f => api.applyFaceMaterial(f));
    if (!skipInspectorRebuild) {
      renderLayersPanel();
      renderInspectorPanel();
    } else {
      // Actualizar solo números del inspector en tiempo real sin destruir los inputs
      const lyr = getSelectedLayer();
      if (lyr) {
        const sv = document.getElementById('ins-scale-v');
        const si = document.getElementById('ins-scale');
        if (sv) sv.textContent = `${Math.round(lyr.scale)}%`;
        if (si) si.value = Math.round(lyr.scale);
        const xv = document.getElementById('ins-x-v');
        const xi = document.getElementById('ins-x');
        if (xv) xv.textContent = Math.round(lyr.x);
        if (xi) xi.value = Math.round(lyr.x);
        const yv = document.getElementById('ins-y-v');
        const yi = document.getElementById('ins-y');
        if (yv) yv.textContent = Math.round(lyr.y);
        if (yi) yi.value = Math.round(lyr.y);
        const rv = document.getElementById('ins-rot-v');
        const ri = document.getElementById('ins-rot');
        if (rv) rv.textContent = `${Math.round(lyr.rot || 0)}°`;
        if (ri) ri.value = Math.round(lyr.rot || 0);
      }
    }
  }

  window.StudioUI = {
    init,
    setAppMode,
    setDrawer,
    getActiveFace,
    getSelectedLayer,
    selectLayer,
    refreshAllUI,
    onExternalFaceMutated,
    getAppMode: () => appMode
  };
})();
