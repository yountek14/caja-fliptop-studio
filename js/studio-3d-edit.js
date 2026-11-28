/**
 * Studio3DEdit — Panel de Herramientas y Gizmos 3D estilo Roblox Studio
 * Herramientas:
 *  - 'select' (1): Seleccionar caras/capas en 3D con marco de selección
 *  - 'move'   (2): Gizmo de flechas 3D (Rojo X, Verde Y, Centro libre) + Snap en mm
 *  - 'scale'  (3): Gizmo de tiradores 3D en bordes/esquinas + sonido dinámico "dots"
 *  - 'rotate' (4): Gizmo de anillo circular 3D + Snap angular (5°/15°/45°/90°)
 * También soporta Drag & Drop de imágenes directo sobre caras 3D y Shift/Alt+Scroll.
 */
(function () {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const hitPoint3D = new THREE.Vector3();

  const state3D = {
    active: false,
    tool: 'move',           // 'select' | 'move' | 'scale' | 'rotate'
    snapMoveEnabled: true,
    snapMoveMm: 1,          // 0 (libre), 1, 2, 5 mm
    snapRotEnabled: true,
    snapRotDeg: 15,         // 0 (libre), 5, 15, 45, 90 deg
    isDragging: false,
    dragMode: null,         // 'moveX' | 'moveY' | 'moveFree' | 'scale' | 'rotate'
    dragFace: null,
    dragLayer: null,
    dragStartLocal: null,   // { x, z } en espacio local del panel
    dragStartLayer: null,
    dragStartDist: 1,
    dragStartAngle: 0,
    lastSnapX: false,
    lastSnapY: false,
    lastSnapRot: null
  };

  let api = null;
  let gizmoRoot = null;
  let gizmoParentPanel = null;
  let gizmoHandles = []; // meshes clickeables del gizmo con userData.handleType

  function init(bridgeApi) {
    api = bridgeApi;
    gizmoRoot = new THREE.Group();
    gizmoRoot.name = 'Studio3DGizmo';
    gizmoRoot.renderOrder = 999;
    setupRibbonUI();
    setup3DEvents();
    setupKeyboardTools();
  }

  function isEditingActive() {
    return state3D.active && api && api.getAppMode && api.getAppMode() === 'studio';
  }

  function setActive(val) {
    state3D.active = !!val;
    if (!val) {
      state3D.isDragging = false;
      state3D.dragMode = null;
      detachGizmo();
    } else {
      rebuildGizmo();
    }
    syncOverlayUI();
  }

  function setTool(tool) {
    if (!['select', 'move', 'scale', 'rotate', 'bucket'].includes(tool)) return;
    state3D.tool = tool;
    rebuildGizmo();
    syncOverlayUI();
    const dom = api && api.getRendererDom && api.getRendererDom();
    if (dom) dom.style.cursor = tool === 'bucket' ? 'crosshair' : '';
  }

  function detachGizmo() {
    if (gizmoParentPanel && gizmoRoot) {
      gizmoParentPanel.remove(gizmoRoot);
      gizmoParentPanel = null;
    }
  }

  function clearGizmoChildren() {
    gizmoHandles = [];
    while (gizmoRoot.children.length > 0) {
      const ch = gizmoRoot.children[0];
      gizmoRoot.remove(ch);
      if (ch.geometry) ch.geometry.dispose();
      if (ch.material) {
        if (Array.isArray(ch.material)) ch.material.forEach(m => m.dispose());
        else ch.material.dispose();
      }
    }
  }

  function makeMat(hex, opacity = 0.96) {
    return new THREE.MeshBasicMaterial({
      color: hex,
      transparent: opacity < 1,
      opacity,
      depthTest: false,
      side: THREE.DoubleSide
    });
  }

  function makeLineMat(hex) {
    return new THREE.LineBasicMaterial({ color: hex, depthTest: false });
  }

  /**
   * Convierte posición de capa (layer.x, layer.y en %) a coordenadas locales (lx, lz) del panel 3D.
   */
  function facePctToLocal(f, pctX, pctY) {
    const [x0, x1, y0, y1] = f.b;
    const uFace = 0.5 + (pctX || 0) / 100;
    const vFace = 0.5 + (pctY || 0) / 100;
    const uTex = f.dh ? (1 - uFace) : uFace;
    const vTex = f.dv ? (1 - vFace) : vFace;
    const lx = x0 + uTex * (x1 - x0);
    const lz = -(y0 + vTex * (y1 - y0));
    return { lx, lz };
  }

  /**
   * Reconstruye la geometría 3D del Gizmo sobre la cara activa y capa seleccionada.
   */
  function rebuildGizmo() {
    if (!api || !gizmoRoot) return;
    if (!state3D.active) { detachGizmo(); return; }

    const f = api.getActiveFace();
    const lyr = api.getSelectedLayer();
    const panels = api.getPanels();
    if (!f || !panels || !panels[f.k]) { detachGizmo(); return; }

    const panel = panels[f.k];
    if (gizmoParentPanel !== panel) {
      detachGizmo();
      panel.add(gizmoRoot);
      gizmoParentPanel = panel;
    }

    clearGizmoChildren();

    // Micro-offset hacia afuera de la cara (Lado A: -Y, Lado B: +Y)
    const normalSign = f.meshKey === 'outer' ? -1 : 1;
    const ySurf = normalSign * 0.85;
    const dirX = f.dh ? -1 : 1;
    const dirZ = f.dv ? 1 : -1;

    // 0. MARCO 3D GRUESO DE SELECCIÓN ESTILO ROBLOX STUDIO (barras reales BoxGeometry sobre los bordes)
    const faceMesh = panel.userData && panel.userData[f.meshKey];
    if (faceMesh && faceMesh.geometry) {
      const borderHex = state3D.tool === 'select'
        ? 0x00e5ff
        : (state3D.tool === 'bucket'
          ? new THREE.Color(window.StudioColorWheel ? window.StudioColorWheel.getColor() : '#facc15').getHex()
          : 0xfacc15);

      const frameGroup = new THREE.Group();
      frameGroup.rotation.copy(faceMesh.rotation);
      frameGroup.scale.copy(faceMesh.scale);
      frameGroup.position.set(faceMesh.position.x, normalSign * 0.62, faceMesh.position.z);

      const edgesGeo = new THREE.EdgesGeometry(faceMesh.geometry);
      const posAttr = edgesGeo.attributes.position;
      const barMat = new THREE.MeshBasicMaterial({
        color: borderHex,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });

      const thickness = 1.15;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i += 2) {
        a.fromBufferAttribute(posAttr, i);
        b.fromBufferAttribute(posAttr, i + 1);
        const len = a.distanceTo(b);
        if (len < 0.2) continue;
        mid.addVectors(a, b).multiplyScalar(0.5);
        dir.subVectors(b, a);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len + thickness * 0.6, thickness, thickness * 0.5), barMat);
        bar.position.copy(mid);
        bar.rotation.z = Math.atan2(dir.y, dir.x);
        bar.renderOrder = 996;
        frameGroup.add(bar);
      }
      edgesGeo.dispose();
      gizmoRoot.add(frameGroup);
    }

    if (!lyr || lyr.visible === false) return;

    const { lx, lz } = facePctToLocal(f, lyr.x, lyr.y);
    const { dw, dh } = window.StudioLayers.getLayerDrawSize(lyr, f.w, f.h);
    const hw = Math.max(4, Math.min(f.w * 0.9, dw / 2));
    const hh = Math.max(4, Math.min(f.h * 0.9, dh / 2));
    const rad = ((lyr.rot || 0) * Math.PI) / 180;

    // Grupo centrado en la posición de la capa sobre el plano XZ del panel
    const anchor = new THREE.Group();
    anchor.position.set(lx, ySurf, lz);
    gizmoRoot.add(anchor);

    // 1. Marco delimitador de la capa (siempre visible, rotado según layer.rot)
    const boxPts = [
      [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]
    ].map(([px, py]) => {
      const rx = px * Math.cos(rad) - py * Math.sin(rad);
      const ry = px * Math.sin(rad) + py * Math.cos(rad);
      return new THREE.Vector3(rx * dirX, 0, ry * dirZ);
    });
    const boxLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boxPts),
      makeLineMat(state3D.tool === 'select' ? 0x38bdf8 : 0xf59e0b)
    );
    boxLine.renderOrder = 998;
    anchor.add(boxLine);

    if (lyr.locked || state3D.tool === 'select' || state3D.tool === 'bucket') return;

    // 2. HERRAMIENTA MOVE (4 Flechas simétricas hacia afuera estilo Roblox Studio + hitboxes amplias)
    if (state3D.tool === 'move') {
      const arrowLen = Math.max(7, Math.min(10.5, Math.min(f.w, f.h) * 0.24));
      const hitMat = makeMat(0xffffff, 0.001);

      const addArrowX = sign => {
        const s = dirX * sign;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, arrowLen, 10), makeMat(0xef4444));
        shaft.rotation.z = -Math.PI / 2;
        shaft.position.set(s * (arrowLen / 2), 0, 0);
        shaft.renderOrder = 1000;
        anchor.add(shaft);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.6, 12), makeMat(0xef4444));
        cone.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        cone.position.set(s * (arrowLen + 1.5), 0, 0);
        cone.renderOrder = 1001;
        anchor.add(cone);

        // Hitbox amplia invisible para agarre cómodo
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, arrowLen + 5, 8), hitMat);
        hit.rotation.z = -Math.PI / 2;
        hit.position.set(s * ((arrowLen + 2) / 2), 0, 0);
        hit.userData.handleType = 'moveX';
        anchor.add(hit);
        gizmoHandles.push(hit);
      };

      const addArrowY = sign => {
        const s = dirZ * sign;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, arrowLen, 10), makeMat(0x22c55e));
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0, s * (arrowLen / 2));
        shaft.renderOrder = 1000;
        anchor.add(shaft);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.6, 12), makeMat(0x22c55e));
        cone.rotation.x = s > 0 ? Math.PI / 2 : -Math.PI / 2;
        cone.position.set(0, 0, s * (arrowLen + 1.5));
        cone.renderOrder = 1001;
        anchor.add(cone);

        // Hitbox amplia invisible para agarre cómodo
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, arrowLen + 5, 8), hitMat);
        hit.rotation.x = Math.PI / 2;
        hit.position.set(0, 0, s * ((arrowLen + 2) / 2));
        hit.userData.handleType = 'moveY';
        anchor.add(hit);
        gizmoHandles.push(hit);
      };

      // 4 flechas hacia afuera (+X, -X, +Y, -Y)
      addArrowX(1);
      addArrowX(-1);
      addArrowY(1);
      addArrowY(-1);

      // Esfera Central (Mover libre en 2 ejes) con radio de agarre más grande
      const centerBall = new THREE.Mesh(new THREE.SphereGeometry(2.5, 14, 14), makeMat(0xf59e0b));
      centerBall.renderOrder = 1002;
      anchor.add(centerBall);

      const centerHit = new THREE.Mesh(new THREE.SphereGeometry(4.6, 10, 10), hitMat);
      centerHit.userData.handleType = 'moveFree';
      anchor.add(centerHit);
      gizmoHandles.push(centerHit);
    }

    // 3. HERRAMIENTA SCALE (4 esferas azules en lados + 4 cubos dorados en esquinas, con hitboxes amplias)
    if (state3D.tool === 'scale') {
      const sidePts = [[hw, 0], [-hw, 0], [0, hh], [0, -hh]];
      const cornerPts = [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]];
      const hitMat = makeMat(0xffffff, 0.001);

      sidePts.forEach(([px, py]) => {
        const rx = px * Math.cos(rad) - py * Math.sin(rad);
        const ry = px * Math.sin(rad) + py * Math.cos(rad);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(2.0, 12, 12), makeMat(0x3b82f6));
        ball.position.set(rx * dirX, 0, ry * dirZ);
        ball.renderOrder = 1001;
        anchor.add(ball);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 8), hitMat);
        hit.position.set(rx * dirX, 0, ry * dirZ);
        hit.userData.handleType = 'scale';
        anchor.add(hit);
        gizmoHandles.push(hit);
      });

      cornerPts.forEach(([px, py]) => {
        const rx = px * Math.cos(rad) - py * Math.sin(rad);
        const ry = px * Math.sin(rad) + py * Math.cos(rad);
        const cube = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.0, 3.0), makeMat(0xf59e0b));
        cube.position.set(rx * dirX, 0, ry * dirZ);
        cube.renderOrder = 1002;
        anchor.add(cube);

        const hit = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 8), hitMat);
        hit.position.set(rx * dirX, 0, ry * dirZ);
        hit.userData.handleType = 'scale';
        anchor.add(hit);
        gizmoHandles.push(hit);
      });
    }

    // 4. HERRAMIENTA ROTATE (Anillo circular 3D celeste + tirador de ángulo)
    if (state3D.tool === 'rotate') {
      const ringR = Math.max(10, Math.min(24, Math.hypot(hw, hh) * 0.85));
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 0.75, 10, 48),
        makeMat(0x0ea5e9, 0.92)
      );
      torus.rotation.x = Math.PI / 2;
      torus.userData.handleType = 'rotate';
      torus.renderOrder = 1000;
      anchor.add(torus);
      gizmoHandles.push(torus);

      // Hit-ring más grueso invisible para agarrar fácilmente
      const hitRing = new THREE.Mesh(
        new THREE.TorusGeometry(ringR, 2.6, 8, 32),
        makeMat(0x0ea5e9, 0.01)
      );
      hitRing.rotation.x = Math.PI / 2;
      hitRing.userData.handleType = 'rotate';
      anchor.add(hitRing);
      gizmoHandles.push(hitRing);

      // Esfera indicadora del ángulo actual sobre el anillo
      const hx = Math.sin(rad) * ringR * dirX;
      const hz = Math.cos(rad) * ringR * dirZ;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 14), makeMat(0xf59e0b));
      knob.position.set(hx, 0, hz);
      knob.userData.handleType = 'rotate';
      knob.renderOrder = 1002;
      anchor.add(knob);
      gizmoHandles.push(knob);
    }
  }

  function setupRibbonUI() {
    document.querySelectorAll('.rblx-tool-btn').forEach(btn => {
      btn.onclick = () => {
        if (window.StudioAudio) window.StudioAudio.playAction('click');
        setTool(btn.dataset.rtool);
      };
    });

    const snapMChk = document.getElementById('rblx-snap-move-chk');
    const snapMSel = document.getElementById('rblx-snap-move-val');
    const snapRChk = document.getElementById('rblx-snap-rot-chk');
    const snapRSel = document.getElementById('rblx-snap-rot-val');
    if (snapMChk) snapMChk.onchange = e => { state3D.snapMoveEnabled = e.target.checked; };
    if (snapMSel) snapMSel.onchange = e => { state3D.snapMoveMm = parseFloat(e.target.value) || 0; };
    if (snapRChk) snapRChk.onchange = e => { state3D.snapRotEnabled = e.target.checked; };
    if (snapRSel) snapRSel.onchange = e => { state3D.snapRotDeg = parseFloat(e.target.value) || 0; };

    const lidSlider = document.getElementById('s3d-lid-slider');
    if (lidSlider) {
      lidSlider.oninput = e => {
        api.setLidOpen(parseFloat(e.target.value));
        const lbl = document.getElementById('s3d-lid-val');
        if (lbl) lbl.textContent = `${Math.round(e.target.value)}°`;
      };
    }

    // Acciones rápidas del Ribbon (Duplicar, Centrar, Subir/Bajar capa, Flip, Eliminar)
    const bindAction = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    };

    bindAction('rblx-act-dup', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr) return;
      api.pushHistory();
      window.StudioLayers.ensureFaceLayers(f);
      const clone = { ...lyr, id: window.StudioLayers.genId(lyr.type), x: (lyr.x || 0) + 6, y: (lyr.y || 0) - 6, name: `${lyr.name} copia` };
      f.layers.push(clone);
      api.selectLayer(clone.id);
      api.onFaceMutated([f], false);
      rebuildGizmo();
      if (window.StudioAudio) window.StudioAudio.playAction('add');
    });

    bindAction('rblx-act-center', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr || lyr.locked) return;
      api.pushHistory();
      lyr.x = 0; lyr.y = 0;
      api.onFaceMutated([f], false);
      rebuildGizmo();
      if (window.StudioAudio) window.StudioAudio.playSnap();
    });

    bindAction('rblx-act-flip', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr || lyr.locked) return;
      api.pushHistory();
      lyr.fh = !lyr.fh;
      api.onFaceMutated([f], false);
      if (window.StudioAudio) window.StudioAudio.playAction('click');
    });

    bindAction('rblx-act-zup', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr) return;
      window.StudioLayers.ensureFaceLayers(f);
      const idx = f.layers.indexOf(lyr);
      if (idx >= 0 && idx < f.layers.length - 1) {
        api.pushHistory();
        [f.layers[idx], f.layers[idx + 1]] = [f.layers[idx + 1], f.layers[idx]];
        api.onFaceMutated([f], false);
        if (window.StudioAudio) window.StudioAudio.playAction('click');
      }
    });

    bindAction('rblx-act-zdown', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr) return;
      window.StudioLayers.ensureFaceLayers(f);
      const idx = f.layers.indexOf(lyr);
      if (idx > 0) {
        api.pushHistory();
        [f.layers[idx], f.layers[idx - 1]] = [f.layers[idx - 1], f.layers[idx]];
        api.onFaceMutated([f], false);
        if (window.StudioAudio) window.StudioAudio.playAction('click');
      }
    });

    bindAction('rblx-act-del', () => {
      const f = api.getActiveFace(), lyr = api.getSelectedLayer();
      if (!f || !lyr) return;
      api.pushHistory();
      f.layers = f.layers.filter(l => l.id !== lyr.id);
      api.selectLayer(f.layers.length ? f.layers[f.layers.length - 1].id : null);
      api.onFaceMutated([f], false);
      api.updateCoverageUI();
      rebuildGizmo();
      if (window.StudioAudio) window.StudioAudio.playAction('delete');
    });
  }

  function setupKeyboardTools() {
    window.addEventListener('keydown', e => {
      if (!isEditingActive()) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '1') { setTool('select'); if (window.StudioAudio) window.StudioAudio.playAction('click'); }
      else if (e.key === '2') { setTool('move'); if (window.StudioAudio) window.StudioAudio.playAction('click'); }
      else if (e.key === '3') { setTool('scale'); if (window.StudioAudio) window.StudioAudio.playAction('click'); }
      else if (e.key === '4') { setTool('rotate'); if (window.StudioAudio) window.StudioAudio.playAction('click'); }
      else if (e.key === '5') { setTool('bucket'); if (window.StudioAudio) window.StudioAudio.playAction('click'); }
    });
  }

  function syncOverlayUI() {
    const bar = document.getElementById('studio-3d-ribbon');
    if (bar) bar.classList.toggle('hidden', !state3D.active);

    document.querySelectorAll('.rblx-tool-btn').forEach(btn => {
      const active = btn.dataset.rtool === state3D.tool;
      btn.className = `rblx-tool-btn flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] transition ${
        active
          ? 'bg-amber-600 text-white font-bold shadow-sm'
          : 'text-stone-700 dark:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-zinc-700/70 font-semibold'
      }`;
    });

    const badge = document.getElementById('s3d-face-badge');
    if (badge && api) {
      const f = api.getActiveFace();
      const lyr = api.getSelectedLayer();
      badge.textContent = f
        ? `${f.n}${lyr ? ` · ${lyr.type === 'text' ? (lyr.text || 'Texto').slice(0, 12) : (lyr.name || 'Capa').slice(0, 14)}` : ' (sin capa)'}`
        : 'Clic en una cara 3D';
    }
  }

  function setRayFromClient(clientX, clientY) {
    const dom = api.getRendererDom();
    const camera = api.getCamera();
    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return true;
  }

  function intersectPanelPlane(panel, clientX, clientY) {
    if (!setRayFromClient(clientX, clientY)) return null;
    panel.updateWorldMatrix(true, false);
    const originWorld = new THREE.Vector3(0, 0, 0).applyMatrix4(panel.matrixWorld);
    const normalWorld = new THREE.Vector3(0, 1, 0).transformDirection(panel.matrixWorld).normalize();
    dragPlane.setFromNormalAndCoplanarPoint(normalWorld, originWorld);
    if (!raycaster.ray.intersectPlane(dragPlane, hitPoint3D)) return null;
    const inv = new THREE.Matrix4().copy(panel.matrixWorld).invert();
    const localPt = hitPoint3D.clone().applyMatrix4(inv);
    return { x: localPt.x, z: localPt.z };
  }

  function raycastExternalFace(clientX, clientY) {
    if (!setRayFromClient(clientX, clientY)) return null;
    const panels = api.getPanels();
    const activeFaces = api.getActiveExternalFaces();
    const targets = [];
    const meshToFace = new Map();
    activeFaces.forEach(f => {
      const grp = panels[f.k];
      if (!grp || !grp.visible) return;
      const mesh = grp.userData && grp.userData[f.meshKey];
      if (mesh) { targets.push(mesh); meshToFace.set(mesh, f); }
    });
    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    return { face: meshToFace.get(hits[0].object), hit: hits[0] };
  }

  /**
   * Hit-test de capas (de arriba hacia abajo) sobre una cara 3D dado el impacto del Raycaster.
   */
  function hitTestLayerOnFace(f, hit) {
    if (!f || !hit || !hit.uv || !f.b) return null;
    window.StudioLayers.ensureFaceLayers(f);
    if (!f.layers.length) return null;

    const [x0, x1, y0, y1] = f.b;
    const uTex = (hit.uv.x - x0) / Math.max(0.0001, x1 - x0);
    const vTex = (hit.uv.y - y0) / Math.max(0.0001, y1 - y0);
    const uFace = f.dh ? (1 - uTex) : uTex;
    const vFace = f.dv ? (1 - vTex) : vTex;

    const clickXmm = (uFace - 0.5) * f.w;
    const clickYmm = (vFace - 0.5) * f.h;

    for (let i = f.layers.length - 1; i >= 0; i--) {
      const lyr = f.layers[i];
      if (lyr.visible === false) continue;
      const cx = ((lyr.x || 0) / 100) * f.w;
      const cy = ((lyr.y || 0) / 100) * f.h;
      const { dw, dh } = window.StudioLayers.getLayerDrawSize(lyr, f.w, f.h);
      const rad = -((lyr.rot || 0) * Math.PI) / 180;
      const dx = clickXmm - cx;
      const dy = clickYmm - cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= dw / 2 + 1.5 && Math.abs(ly) <= dh / 2 + 1.5) {
        return lyr;
      }
    }
    return null;
  }

  function setup3DEvents() {
    const dom = api.getRendererDom();
    if (!dom) return;

    dom.addEventListener('mousedown', e => {
      if (!isEditingActive() || e.button !== 0) return;

      // 0. MODO BALDE DE PINTURA (5): clic en cualquier cara 3D pinta su base con el color activo
      if (state3D.tool === 'bucket') {
        const res = raycastExternalFace(e.clientX, e.clientY);
        if (res && res.face) {
          e.stopImmediatePropagation();
          const hex = window.StudioColorWheel ? window.StudioColorWheel.getColor() : '#1a242e';
          api.pushHistory();
          res.face.fillColor = hex;
          res.face.bgColor = hex;
          api.selectFaceFrom3D(res.face.k);
          api.onFaceMutated([res.face], false);
          api.updateCoverageUI();
          if (window.StudioAudio) window.StudioAudio.playAction('add');
          api.showToast(`Cara "${res.face.n}" pintada (${hex.toUpperCase()})`);
          syncOverlayUI();
        }
        return;
      }

      // 1. Prioridad máxima: verificar si tocó un handle del Gizmo 3D
      if (gizmoHandles.length > 0 && setRayFromClient(e.clientX, e.clientY)) {
        const gHits = raycaster.intersectObjects(gizmoHandles, false);
        if (gHits.length > 0) {
          const handleType = gHits[0].object.userData.handleType;
          const f = api.getActiveFace();
          const lyr = api.getSelectedLayer();
          const panel = f && api.getPanels()[f.k];
          if (f && lyr && panel && !lyr.locked) {
            const localPt = intersectPanelPlane(panel, e.clientX, e.clientY);
            if (localPt) {
              e.stopImmediatePropagation();
              api.pushHistory();
              state3D.isDragging = true;
              state3D.dragMode = handleType;
              state3D.dragFace = f;
              state3D.dragLayer = lyr;
              state3D.dragStartLocal = localPt;
              state3D.dragStartLayer = { ...lyr };
              const center = facePctToLocal(f, lyr.x, lyr.y);
              state3D.dragStartDist = Math.max(2, Math.hypot(localPt.x - center.lx, localPt.z - center.lz));
              const dirX = f.dh ? -1 : 1;
              const dirZ = f.dv ? 1 : -1;
              state3D.dragStartAngle = Math.atan2((localPt.x - center.lx) * dirX, (localPt.z - center.lz) * dirZ);
              state3D.lastSnapX = false;
              state3D.lastSnapY = false;
              state3D.lastSnapRot = null;
              if (window.StudioAudio) {
                window.StudioAudio.resetScaleTracker(lyr.scale || 100);
                window.StudioAudio.resetRotateTracker(lyr.rot || 0);
              }
              dom.style.cursor = 'grabbing';
              return;
            }
          }
        }
      }

      // 2. Si no tocó un gizmo, verificar si hizo clic en una cara o en un asset/imagen sobre la cara 3D
      const res = raycastExternalFace(e.clientX, e.clientY);
      if (res && res.face) {
        const cur = api.getActiveFace();
        const hitLayer = hitTestLayerOnFace(res.face, res.hit);
        const faceChanged = !cur || cur.k !== res.face.k;
        const curLyr = api.getSelectedLayer();
        const layerChanged = hitLayer && (!curLyr || curLyr.id !== hitLayer.id);

        if (faceChanged) {
          api.selectFaceFrom3D(res.face.k);
        }
        if (hitLayer) {
          api.selectLayer(hitLayer.id);
        }
        if (faceChanged || layerChanged) {
          rebuildGizmo();
          syncOverlayUI();
          if (window.StudioAudio) window.StudioAudio.playAction('click');
        }
      }
    }, true);

    window.addEventListener('mousemove', e => {
      if (!state3D.isDragging || !state3D.dragFace || !state3D.dragLayer) return;
      const f = state3D.dragFace;
      const lyr = state3D.dragLayer;
      const panel = api.getPanels()[f.k];
      if (!panel) return;
      const pt = intersectPanelPlane(panel, e.clientX, e.clientY);
      if (!pt) return;

      const dirX = f.dh ? -1 : 1;
      const dirZ = f.dv ? 1 : -1;

      if (state3D.dragMode === 'moveX' || state3D.dragMode === 'moveY' || state3D.dragMode === 'moveFree') {
        const dxMm = (pt.x - state3D.dragStartLocal.x) * dirX;
        const dyMm = (pt.z - state3D.dragStartLocal.z) * dirZ;

        let nxMm = (state3D.dragStartLayer.x / 100) * f.w + (state3D.dragMode === 'moveY' ? 0 : dxMm);
        let nyMm = (state3D.dragStartLayer.y / 100) * f.h + (state3D.dragMode === 'moveX' ? 0 : dyMm);

        // Snap a incrementos en mm (estilo Roblox Studio)
        if (state3D.snapMoveEnabled && state3D.snapMoveMm > 0 && !e.altKey) {
          nxMm = Math.round(nxMm / state3D.snapMoveMm) * state3D.snapMoveMm;
          nyMm = Math.round(nyMm / state3D.snapMoveMm) * state3D.snapMoveMm;
        }

        // Imán al centro exacto (0,0)
        const snappedX = Math.abs(nxMm) < 1.2 && state3D.dragMode !== 'moveY';
        const snappedY = Math.abs(nyMm) < 1.2 && state3D.dragMode !== 'moveX';
        if (snappedX) nxMm = 0;
        if (snappedY) nyMm = 0;
        if ((snappedX && !state3D.lastSnapX) || (snappedY && !state3D.lastSnapY)) {
          if (window.StudioAudio) window.StudioAudio.playSnap();
        }
        state3D.lastSnapX = snappedX;
        state3D.lastSnapY = snappedY;

        lyr.x = Math.max(-120, Math.min(120, Math.round((nxMm / f.w) * 1000) / 10));
        lyr.y = Math.max(-120, Math.min(120, Math.round((nyMm / f.h) * 1000) / 10));
        api.onFaceMutated([f], true);
        rebuildGizmo();
      } else if (state3D.dragMode === 'scale') {
        const center = facePctToLocal(f, state3D.dragStartLayer.x, state3D.dragStartLayer.y);
        const curDist = Math.max(1.5, Math.hypot(pt.x - center.lx, pt.z - center.lz));
        const ratio = curDist / state3D.dragStartDist;
        const minS = lyr.type === 'sticker' ? 5 : 10;
        const maxS = 300;
        const nextScale = Math.max(minS, Math.min(maxS, Math.round(state3D.dragStartLayer.scale * ratio)));
        if (nextScale !== lyr.scale) {
          lyr.scale = nextScale;
          if (window.StudioAudio) window.StudioAudio.onScaleChange(nextScale, minS, maxS, 2);
          api.onFaceMutated([f], true);
          rebuildGizmo();
        }
      } else if (state3D.dragMode === 'rotate') {
        const center = facePctToLocal(f, state3D.dragStartLayer.x, state3D.dragStartLayer.y);
        const curAngle = Math.atan2((pt.x - center.lx) * dirX, (pt.z - center.lz) * dirZ);
        let deg = (state3D.dragStartLayer.rot || 0) + ((curAngle - state3D.dragStartAngle) * 180) / Math.PI;
        deg = ((deg + 180) % 360 + 360) % 360 - 180;

        if (state3D.snapRotEnabled && state3D.snapRotDeg > 0 && !e.altKey) {
          deg = Math.round(deg / state3D.snapRotDeg) * state3D.snapRotDeg;
        }
        const rounded = Math.round(deg);
        if (rounded !== lyr.rot) {
          lyr.rot = rounded;
          if (window.StudioAudio) {
            if (rounded % 90 === 0 && state3D.lastSnapRot !== rounded) {
              window.StudioAudio.playSnap();
              state3D.lastSnapRot = rounded;
            } else {
              window.StudioAudio.onRotateChange(rounded, 5);
            }
          }
          api.onFaceMutated([f], true);
          rebuildGizmo();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (!state3D.isDragging) return;
      state3D.isDragging = false;
      state3D.dragMode = null;
      state3D.dragFace = null;
      state3D.dragLayer = null;
      dom.style.cursor = '';
      if (window.StudioAudio) {
        window.StudioAudio.resetScaleTracker(null);
        window.StudioAudio.resetRotateTracker(null);
      }
    });

    // Drag & Drop de imágenes directo sobre cualquier cara 3D
    dom.addEventListener('dragover', e => {
      if (!isEditingActive()) return;
      e.preventDefault();
    });
    dom.addEventListener('drop', e => {
      if (!isEditingActive()) return;
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const res = raycastExternalFace(e.clientX, e.clientY);
      const targetFace = res ? res.face : api.getActiveFace();
      if (!targetFace) return;
      api.loadImageFile(file, img => {
        api.pushHistory();
        api.selectFaceFrom3D(targetFace.k);
        window.StudioLayers.ensureFaceLayers(targetFace);
        const lyr = window.StudioLayers.createImageLayer(img, {
          name: file.name.replace(/\.[^.]+$/, ''),
          fitMode: 'cover'
        });
        targetFace.layers.push(lyr);
        window.StudioLayers.extractPaletteFromImage(img, 5);
        api.selectLayer(lyr.id);
        api.onFaceMutated([targetFace], false);
        api.updateCoverageUI();
        rebuildGizmo();
        if (window.StudioAudio) window.StudioAudio.playAction('add');
        api.showToast(`Imagen soltada en ${targetFace.n} (3D)`);
      });
    });
  }

  window.Studio3DEdit = {
    init,
    setActive,
    setTool,
    rebuildGizmo,
    syncOverlayUI,
    isActive: () => state3D.active
  };
})();
