#!/usr/bin/env python3
"""
Escanea las carpetas de stickers (bands/, pop/, monster/) y actualiza
automaticamente stickers/manifest.json para que los nuevos PNG/SVG/WebP
aparezcan en la Galeria de Stickers de Caja Flip-Top Studio.
"""
import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CATEGORIES = ["bands", "pop", "monster"]
VALID_EXTS = (".png", ".svg", ".webp")
MANIFEST_PATH = os.path.join(BASE_DIR, "manifest.json")

# Mantener configuracion previa (defaultColor / tintable) si el archivo ya existia
existing = {}
if os.path.exists(MANIFEST_PATH):
    try:
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            old = json.load(f)
        for cat_items in old.values():
            for item in cat_items:
                existing[item["src"]] = item
    except Exception:
        pass

manifest = {cat: [] for cat in CATEGORIES}

for cat in CATEGORIES:
    folder = os.path.join(BASE_DIR, cat)
    os.makedirs(folder, exist_ok=True)
    for fname in sorted(os.listdir(folder)):
        if not fname.lower().endswith(VALID_EXTS):
            continue
        rel_src = f"stickers/{cat}/{fname}"
        if rel_src in existing:
            manifest[cat].append(existing[rel_src])
        else:
            clean_name = os.path.splitext(fname)[0].replace("_", " ").replace("-", " ").title()
            manifest[cat].append({
                "id": f"{cat}_{os.path.splitext(fname)[0]}",
                "name": clean_name,
                "src": rel_src,
                "tintable": fname.lower().endswith(".svg") and cat == "bands",
                "defaultColor": "#ffffff"
            })

with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)

total = sum(len(v) for v in manifest.values())
print(f"manifest.json actualizado correctamente ({total} stickers en {len(CATEGORIES)} categorias).")
