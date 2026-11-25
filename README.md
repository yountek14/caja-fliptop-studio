# 📦 Caja Flip-Top Studio

Herramienta web interactiva **2D + 3D** para diseñar, personalizar y exportar plantillas **1:1 en milímetros** de una **caja flip-top (55×24×88 mm) con bolsillo lateral integrado para encendedor BIC J6 (27×24×83 mm)**, armada en una sola pieza de cartón.

---

## ✨ ¿Qué hace el programa?

- **Vista 3D en tiempo real:** Simula el plegado paso a paso (dobleces valle `+90°` y montaña `-90°`), apertura de tapa (`0°–110°`) e inserción del encendedor BIC J6.
- **Editor de Plantilla 2D Interactivo:** Haz clic o arrastra imágenes directo sobre cualquiera de las **13 caras externas** (9 del **Lado A · Caja y Tapa** + 4 del **Lado B · Bolsillo**). Las caras internas y las 9 pestañas de pegado quedan protegidas sin tinta.
- **Sistema de 3 Capas por Cara:**
  - **Capa 0 — Pintura / Color Base:** Pinta toda la caja, solo Lado A, solo Bolsillo, una cara puntual o el interior.
  - **Capa 1 — Imagen / Textura Principal:** Auto-ajuste inteligente (*Smart Fit*), *Envoltura Continua* o relleno automático por color dominante.
  - **Capa 2 — Stickers / PNGs transparentes:** Galería integrada (Estrellas & Formas, Bandas como *Iron Maiden*, *Motörhead*, *Megadeth*, *Rick & Morty*, *Monster Energy* y tus propios PNGs) con **cambio de color en vivo**, escala, posición y rotación.
- **Biblioteca de `🎨 Diseños`:** Guarda y carga tus diseños completos localmente (`IndexedDB`), incluye el preset **Celestial Dorado & Azul Noche** (305 DPI) y permite exportar/importar archivos `.fliptop.json` para compartir diseños entre PCs.
- **Exportación SVG 1:1 lista para imprimir:**
  - **SVG Lado A** (Caja + Tapa con arte incrustado y sangrado opcional de `2 mm`).
  - **SVG Lado B Espejado** (Bolsillo alineado para impresión doble cara).
  - **SVG Troquel Limpio** (solo líneas de corte y doblez).
- **Modo Claro / Oscuro** completo (interfaz, escena 3D y mesa 2D).

---

## 🚀 Cómo abrirlo (Windows, Linux o Mac)

> **Importante:** Para que carguen los presets (`skins/`) y la galería de stickers (`stickers/`), ábrelo con un servidor local (1 solo comando en la carpeta del proyecto):

```bash
python3 -m http.server 8765
```
*(En Windows suele ser `python -m http.server 8765`)*

Luego abre tu navegador en:
**`http://127.0.0.1:8765`**

---

## 📁 Cómo organizar las carpetas y agregar tus propios PNGs

```text
Caja_Flip_Top_Studio/
├── index.html                   # Aplicación principal (todo en uno)
├── README.md                    # Esta guía
├── backup/                      # Respaldo de la versión original v1
├── skins/                       # Diseños completos preinstalados (13 caras)
│   ├── build_celestial_skin.py
│   └── celestial/               # Preset "Celestial Dorado & Azul Noche"
│       ├── skin.json
│       └── *.png (13 caras a 305 DPI)
└── stickers/                    # Biblioteca de stickers PNG / SVG transparentes
    ├── manifest.json            # Índice que lee la app automáticamente
    ├── actualizar_stickers.py   # Script para registrar nuevos PNGs en 1 segundo
    ├── bands/                   # 🤘 Logos de bandas (Iron Maiden, Motörhead, Megadeth...)
    ├── pop/                     # 🛸 Personajes / series / juegos (Rick & Morty...)
    └── monster/                 # ⚡ Logos, garras y latas estilo Monster Energy
```

### Dos formas de agregar tus propios PNGs:

#### Opción A — Directo desde el navegador (la más rápida)
1. Abre **Stickers / PNG → `✨ Galería`**.
2. Pulsa **`+ Guardar PNG en Biblioteca`**.
3. El PNG queda guardado permanentemente en la pestaña **`💾 Mis PNGs`** de tu navegador.

#### Opción B — Guardando archivos en las carpetas (ideal para compartir en GitHub)
1. Busca PNGs o SVGs **con fondo transparente** y guárdalos dentro de la carpeta que corresponda:
   - Logos de bandas → `stickers/bands/`
   - Personajes de series o videojuegos → `stickers/pop/`
   - Latas / logos Monster → `stickers/monster/`
   - *(Tip: usa nombres simples sin espacios raros, ej. `metallica_logo.png` o `hollow_knight.png`)*.
2. Ejecuta este comando para actualizar el catálogo automáticamente:
   ```bash
   python3 stickers/actualizar_stickers.py
   ```
3. Recarga el navegador (`F5`) y tus nuevos PNGs ya aparecen listos en la **Galería de Stickers** (con opción de cambiarles el color en vivo).

---

## 📐 Medidas de referencia
- **Caja armada:** `55 × 24 × 88 mm`
- **Bolsillo encendedor (BIC J6):** `27 × 24 × 83 mm`
- **Verificación de escala:** Todos los SVG exportados incluyen una barra de verificación de `50 mm` para comprobar que la impresora imprimió al `100%` (sin "ajustar a página").
