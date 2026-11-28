/**
 * StudioIcons — Sistema de Íconos SVG Vectoriales Propios (Opción C — Híbrida)
 * - Studio Duotone minimalista (currentColor + relleno translúcido) para barra superior,
 *   dock, toolbar 2D, capas e inspector.
 * - Acentos de color funcional estilo Roblox Studio/Blender en el Ribbon 3D
 *   + gota de color vivo (--bucket-color) en el Balde de Pintura.
 */
(function () {
  const ICONS = {
    // --- MODOS PRINCIPALES ---
    'mode-studio': `<path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" fill="currentColor" fill-opacity="0.15"/>`,
    'mode-3d': `<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" fill="currentColor" fill-opacity="0.14"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>`,
    'mode-export': `<path d="M6 9V4h12v5" fill="currentColor" fill-opacity="0.12"/><rect x="4" y="9" width="16" height="8" rx="2" fill="currentColor" fill-opacity="0.14"/><path d="M7 14h10v6H7z" fill="currentColor" fill-opacity="0.08"/>`,

    // --- BARRA SUPERIOR ---
    'undo': `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`,
    'redo': `<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`,
    'sound-on': `<path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" fill-opacity="0.16"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>`,
    'sound-off': `<path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" fill-opacity="0.12"/><path d="m16 9 5 6M21 9l-5 6"/>`,
    'save': `<path d="M5 4h11l3 3v13H5V4Z" fill="currentColor" fill-opacity="0.14"/><path d="M8 4v5h8V4M8 20v-6h8v6"/>`,

    // --- DOCK IZQUIERDO ---
    'dock-assets': `<rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fill-opacity="0.12"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="m21 15-5-5L5 21"/>`,
    'dock-designs': `<rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" fill-opacity="0.16"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><path d="M17 13v8M13 17h8"/>`,
    'dock-text': `<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>`,
    'dock-bg': `<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.12"/><circle cx="9" cy="10" r="1.2" fill="currentColor"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor"/><circle cx="15.5" cy="10.5" r="1.2" fill="currentColor"/><path d="M15 15.5a2 2 0 1 1-3 1.73"/>`,
    'dock-model': `<path d="M6 7h12v13H6z" fill="currentColor" fill-opacity="0.14"/><path d="M6 10h12"/><path d="M6 7 8 4h8l2 3"/>`,

    // --- TOOLBAR LIENZO 2D ---
    'sub-focus': `<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" fill-opacity="0.14"/><path d="M2 8V4a2 2 0 0 1 2-2h4M22 8V4a2 2 0 0 0-2-2h-4M2 16v4a2 2 0 0 0 2 2h4M22 16v4a2 2 0 0 1-2 2h-4"/>`,
    'sub-continuous': `<rect x="6" y="3" width="12" height="18" rx="2" fill="currentColor" fill-opacity="0.14"/><path d="M6 9.5h12" stroke-dasharray="2.5 2"/>`,
    'sub-diecut': `<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z" fill="currentColor" fill-opacity="0.12"/>`,
    'sub-edit3d': `<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" fill="currentColor" fill-opacity="0.14"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/><circle cx="18.5" cy="5.5" r="2.2" fill="#f59e0b" stroke="none"/>`,
    'snap': `<path d="M6 4v7a6 6 0 0 0 12 0V4" fill="currentColor" fill-opacity="0.12"/><path d="M6 4h3v4H6zM15 4h3v4h-3z" fill="currentColor" fill-opacity="0.35"/>`,
    'guides': `<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1" stroke-dasharray="2.5 2" fill="currentColor" fill-opacity="0.12"/>`,

    // --- RIBBON 3D (ACENTOS DE COLOR FUNCIONAL ESTILO ROBLOX STUDIO) ---
    'rblx-select': `<path d="m5 3 6.5 17 2.6-6.2L20 11.2 5 3Z" fill="#38bdf8" fill-opacity="0.28" stroke="#38bdf8"/>`,
    'rblx-move': `<path d="M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3" stroke="#22c55e"/><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" stroke="#ef4444"/><circle cx="12" cy="12" r="2" fill="#f59e0b" stroke="none"/>`,
    'rblx-scale': `<rect x="6" y="6" width="12" height="12" rx="1.5" fill="#3b82f6" fill-opacity="0.14" stroke="#3b82f6"/><rect x="3.5" y="3.5" width="4" height="4" rx="0.8" fill="#f59e0b" stroke="none"/><rect x="16.5" y="3.5" width="4" height="4" rx="0.8" fill="#f59e0b" stroke="none"/><rect x="3.5" y="16.5" width="4" height="4" rx="0.8" fill="#f59e0b" stroke="none"/><rect x="16.5" y="16.5" width="4" height="4" rx="0.8" fill="#f59e0b" stroke="none"/>`,
    'rblx-rotate': `<path d="M20 12a8 8 0 1 1-2.3-5.6" stroke="#0ea5e9"/><path d="M20 4v4.5h-4.5" stroke="#0ea5e9"/><circle cx="12" cy="12" r="2.2" fill="#f59e0b" stroke="none"/>`,
    'rblx-bucket': `<path d="m14.5 4.5 5 5-7.5 7.5a2.1 2.1 0 0 1-3 0l-3.5-3.5a2.1 2.1 0 0 1 0-3l7.5-7.5Z" fill="currentColor" fill-opacity="0.16"/><path d="m10 9 5-5"/><path d="M19.5 14.5c0 1.8-1.5 3.5-1.5 3.5s-1.5-1.7-1.5-3.5a1.5 1.5 0 0 1 3 0Z" fill="var(--bucket-color, #f59e0b)" stroke="var(--bucket-color, #f59e0b)" stroke-width="1.2"/>`,

    // --- ACCIONES RÁPIDAS Y PANEL DE CAPAS ---
    'layers': `<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" fill="currentColor" fill-opacity="0.18"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>`,
    'sliders': `<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="currentColor" fill-opacity="0.25"/><circle cx="15" cy="17" r="2.2" fill="currentColor" fill-opacity="0.25"/>`,
    'center': `<circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>`,
    'duplicate': `<rect x="9" y="9" width="11" height="11" rx="2" fill="currentColor" fill-opacity="0.15"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
    'flip-h': `<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M8 7 3 12l5 5V7Z" fill="currentColor" fill-opacity="0.2"/><path d="m16 7 5 5-5 5V7Z"/>`,
    'flip-v': `<path d="M3 12h18" stroke-dasharray="2 2"/><path d="m7 8 5-5 5 5H7Z" fill="currentColor" fill-opacity="0.2"/><path d="m7 16 5 5 5-5H7Z"/>`,
    'z-up': `<path d="m12 5 6 6H6l6-6Z" fill="currentColor" fill-opacity="0.2"/><path d="M12 11v8"/>`,
    'z-down': `<path d="m12 19 6-6H6l6 6Z" fill="currentColor" fill-opacity="0.2"/><path d="M12 13V5"/>`,
    'trash': `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14" fill="currentColor" fill-opacity="0.12"/>`,
    'eye': `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="12" r="2.8" fill="currentColor" fill-opacity="0.3"/>`,
    'eye-off': `<path d="M3 3l18 18"/><path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5"/><path d="M9.5 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.2 6.2C3.6 8 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>`,
    'lock': `<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
    'unlock': `<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" fill-opacity="0.1"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>`,
    'grip': `<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>`,
    'lyr-image': `<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity="0.14"/><circle cx="8.5" cy="9.5" r="1.5" fill="currentColor"/><path d="m21 16-5-5-6 6"/>`,
    'lyr-sticker': `<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z" fill="currentColor" fill-opacity="0.18"/>`,
    'lyr-text': `<path d="M4 7V5h16v2M12 5v14M9 19h6"/>`,
    'paint-all': `<path d="M4 13a8 8 0 0 1 16 0" fill="currentColor" fill-opacity="0.15"/><path d="M12 3v3M5 7l2 2M19 7l-2 2"/><path d="M6 13h12v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5Z" fill="currentColor" fill-opacity="0.2"/>`,
    'eyedropper': `<path d="m19 5-2-2a2.1 2.1 0 0 0-3 0l-2.5 2.5 5 5L19 8a2.1 2.1 0 0 0 0-3Z" fill="currentColor" fill-opacity="0.22"/><path d="m11.5 5.5 5 5-8 8H5v-3.5l8-8Z" fill="currentColor" fill-opacity="0.12"/><path d="M3 21h4"/>`,
    'video': `<rect x="3" y="6" width="13" height="12" rx="2" fill="currentColor" fill-opacity="0.15"/><path d="m16 10 5-3v10l-5-3v-4Z" fill="currentColor" fill-opacity="0.2"/>`,
    'camera': `<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" fill="currentColor" fill-opacity="0.14"/><circle cx="12" cy="14" r="3.2" fill="currentColor" fill-opacity="0.25"/>`
  };

  function svg(name, cls = 'w-4 h-4') {
    const inner = ICONS[name] || '';
    return `<svg class="${cls} shrink-0 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      const cls = el.dataset.size || 'w-4 h-4';
      el.innerHTML = svg(name, cls);
    });
  }

  window.StudioIcons = { svg, hydrate, ICONS };
})();
