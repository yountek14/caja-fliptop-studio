#!/usr/bin/env python3
"""
Generador del Skin Pack 'Celestial' para Caja Flip-Top Studio v2.
- Extrae fielmente las 2 tarjetas originales de la imagen de referencia (sin borde gris).
- Genera a 305 DPI (12 px/mm, con supersampling 2x) las 13 caras externas exactas.
- Respeta continuidad tapa/cuerpo y la muesca anti-colision de pocketFront.
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFilter

SRC_IMG = "/home/Yountek/.gemini/antigravity/brain/2d3cdaac-e8e9-4f8f-ae73-7b8976ad1940/.user_uploaded/media_1795565204271_a780360c.jpg"
OUT_DIR = "/home/Yountek/Proyectos/Caja_Flip_Top_Studio/skins/celestial"
os.makedirs(OUT_DIR, exist_ok=True)

BG = (26, 36, 46)        # #1a242e muestreado del original
BG_HEX = "#1a242e"
GOLD = (202, 163, 104)   # #caa368 muestreado del original
GOLD_DIM = (158, 128, 84)

PX_MM = 12   # 12 px/mm (~305 DPI)
SS = 2       # Supersampling 2x para antialiasing perfecto
S = PX_MM * SS


def new_hi(w_mm, h_mm):
    im = Image.new("RGB", (int(round(w_mm * S)), int(round(h_mm * S))), BG)
    return im, ImageDraw.Draw(im)


def save_hi(im, name, w_mm, h_mm):
    out = im.resize((int(round(w_mm * PX_MM)), int(round(h_mm * PX_MM))), Image.Resampling.LANCZOS)
    path = os.path.join(OUT_DIR, f"{name}.png")
    out.save(path, "PNG", optimize=True)
    return f"skins/celestial/{name}.png"


def draw_star4(draw, cx, cy, r, color=GOLD):
    """Estrella de 4 puntas estilizada."""
    ri = r * 0.26
    pts = [
        (cx, cy - r), (cx + ri, cy - ri),
        (cx + r, cy), (cx + ri, cy + ri),
        (cx, cy + r), (cx - ri, cy + ri),
        (cx - r, cy), (cx - ri, cy - ri),
    ]
    draw.polygon(pts, fill=color)


def draw_sun(draw, cx, cy, r_core, r_rays, n_rays=28, color=GOLD):
    """Sol celestial con disco central, anillo y rayos alternados."""
    for i in range(n_rays):
        ang = (2 * math.pi * i) / n_rays
        r0 = r_core * 1.28
        r1 = r_rays if i % 2 == 0 else r_rays * 0.72
        x0, y0 = cx + math.cos(ang) * r0, cy + math.sin(ang) * r0
        x1, y1 = cx + math.cos(ang) * r1, cy + math.sin(ang) * r1
        draw.line([(x0, y0), (x1, y1)], fill=color, width=max(1, int(0.16 * S)))
    # Anillo exterior fino
    r_ring = r_core * 1.18
    draw.ellipse([cx - r_ring, cy - r_ring, cx + r_ring, cy + r_ring], outline=color, width=max(1, int(0.16 * S)))
    # Disco central
    draw.ellipse([cx - r_core, cy - r_core, cx + r_core, cy + r_core], fill=color)


def draw_crescent(draw, cx, cy, r, facing="right", color=GOLD):
    """Media luna creciente/menguante limpia."""
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    shift = r * 0.45 * (1 if facing == "right" else -1)
    r_cut = r * 0.86
    draw.ellipse([cx + shift - r_cut, cy - r_cut, cx + shift + r_cut, cy + r_cut], fill=BG)


def draw_frame(draw, w_mm, h_mm, m1=2.2, m2=3.3):
    """Doble filete dorado fino con esquinas decoradas."""
    w, h = w_mm * S, h_mm * S
    lw1 = max(1, int(0.24 * S))
    lw2 = max(1, int(0.14 * S))
    p1 = m1 * S
    p2 = m2 * S
    draw.rectangle([p1, p1, w - p1, h - p1], outline=GOLD, width=lw1)
    if w_mm >= 18 and h_mm >= 18:
        draw.rectangle([p2, p2, w - p2, h - p2], outline=GOLD_DIM, width=lw2)
    # Puntos en esquinas
    pr = 0.55 * S
    for ex, ey in [(p1, p1), (w - p1, p1), (p1, h - p1), (w - p1, h - p1)]:
        draw.ellipse([ex - pr, ey - pr, ex + pr, ey + pr], fill=GOLD)


def build_card_canvas(card_crop, w_mm=55, h_mm=88):
    """
    Coloca una tarjeta recortada en un lienzo w_mm x h_mm sin deformar su proporcion,
    manteniendo los soles 100% circulares y fundiendo suavemente el fondo #1a242e.
    """
    W_px = int(round(w_mm * PX_MM))
    H_px = int(round(h_mm * PX_MM))
    canvas = Image.new("RGB", (W_px, H_px), BG)

    # Ajustar al ancho (dejando un margen limpio de 0.8 mm para que el marco no se corte)
    pad_x = int(round(0.8 * PX_MM))
    target_w = W_px - pad_x * 2
    scale = target_w / card_crop.width
    target_h = int(round(card_crop.height * scale))
    if target_h > H_px - int(round(1.2 * PX_MM)):
        target_h = H_px - int(round(1.2 * PX_MM))
        scale = target_h / card_crop.height
        target_w = int(round(card_crop.width * scale))

    resized = card_crop.resize((target_w, target_h), Image.Resampling.LANCZOS)
    resized = resized.filter(ImageFilter.UnsharpMask(radius=1.0, percent=85, threshold=3))

    ox = (W_px - target_w) // 2
    oy = (H_px - target_h) // 2
    canvas.paste(resized, (ox, oy))
    return canvas


def main():
    src = Image.open(SRC_IMG).convert("RGB")
    # Recortes verificados (+2 px hacia adentro para eliminar cualquier halo gris)
    card_suns = src.crop((152, 43, 483, 528))
    card_frame = src.crop((541, 43, 872, 528))

    manifest = {
        "name": "Celestial Dorado & Azul Noche",
        "innerColor": BG_HEX,
        "faces": {}
    }

    # 1. FRENTE COMPLETO (55 x 88 mm) = lidFront (55 x 26) + front (55 x 62)
    front_full = build_card_canvas(card_suns, 55, 88)
    split_front = 26 * PX_MM
    lid_front = front_full.crop((0, 0, 55 * PX_MM, split_front))
    body_front = front_full.crop((0, split_front, 55 * PX_MM, 88 * PX_MM))
    lid_front.save(os.path.join(OUT_DIR, "lidFront.png"), "PNG", optimize=True)
    body_front.save(os.path.join(OUT_DIR, "front.png"), "PNG", optimize=True)
    manifest["faces"]["lidFront"] = "skins/celestial/lidFront.png"
    manifest["faces"]["front"] = "skins/celestial/front.png"

    # 2. ESPALDA COMPLETA (55 x 88 mm) = lidBack (55 x 22) + back (55 x 66)
    back_full = build_card_canvas(card_frame, 55, 88)
    split_back = 22 * PX_MM
    lid_back = back_full.crop((0, 0, 55 * PX_MM, split_back))
    body_back = back_full.crop((0, split_back, 55 * PX_MM, 88 * PX_MM))
    lid_back.save(os.path.join(OUT_DIR, "lidBack.png"), "PNG", optimize=True)
    body_back.save(os.path.join(OUT_DIR, "back.png"), "PNG", optimize=True)
    manifest["faces"]["lidBack"] = "skins/celestial/lidBack.png"
    manifest["faces"]["back"] = "skins/celestial/back.png"

    # 3. TECHO TAPA (55 x 24 mm)
    im, d = new_hi(55, 24)
    draw_frame(d, 55, 24, 2.0, 3.0)
    cx, cy = 27.5 * S, 12.0 * S
    draw_sun(d, cx, cy, 3.1 * S, 7.2 * S, n_rays=24)
    draw_crescent(d, 13.5 * S, cy, 3.2 * S, facing="right")
    draw_crescent(d, 41.5 * S, cy, 3.2 * S, facing="left")
    for sx in [7.2, 19.5, 35.5, 47.8]:
        draw_star4(d, sx * S, cy, 1.25 * S)
    for sx in [10.0, 45.0]:
        draw_star4(d, sx * S, 6.2 * S, 0.85 * S, GOLD_DIM)
        draw_star4(d, sx * S, 17.8 * S, 0.85 * S, GOLD_DIM)
    manifest["faces"]["top"] = save_hi(im, "top", 55, 24)

    # 4. BASE CAJA (55 x 24 mm)
    im, d = new_hi(55, 24)
    draw_frame(d, 55, 24, 2.2, 3.2)
    draw_sun(d, 27.5 * S, 12.0 * S, 2.3 * S, 5.4 * S, n_rays=16)
    for sx in [11.0, 44.0]:
        draw_star4(d, sx * S, 12.0 * S, 1.3 * S)
    d.line([(14.5 * S, 12 * S), (20.5 * S, 12 * S)], fill=GOLD_DIM, width=max(1, int(0.16 * S)))
    d.line([(34.5 * S, 12 * S), (40.5 * S, 12 * S)], fill=GOLD_DIM, width=max(1, int(0.16 * S)))
    manifest["faces"]["base"] = save_hi(im, "base", 55, 24)

    # 5. LATERAL IZQUIERDO CONTINUO (24 x 88 mm -> lidLeft 24x26 + left 24x66)
    im_l, d = new_hi(24, 88)
    draw_frame(d, 24, 88, 2.0, 3.0)
    cx = 12.0 * S
    # Eje vertical fino
    d.line([(cx, 7 * S), (cx, 81 * S)], fill=GOLD_DIM, width=max(1, int(0.14 * S)))
    # Zona superior (tapa)
    draw_crescent(d, cx, 13.5 * S, 3.2 * S, facing="right")
    draw_star4(d, cx, 6.8 * S, 1.2 * S)
    # Sol central (cuerpo)
    draw_sun(d, cx, 46.0 * S, 3.6 * S, 7.8 * S, n_rays=24)
    draw_star4(d, cx, 31.0 * S, 1.5 * S)
    draw_star4(d, cx, 61.0 * S, 1.5 * S)
    # Luna inferior
    draw_crescent(d, cx, 74.5 * S, 3.2 * S, facing="left")
    draw_star4(d, cx, 81.2 * S, 1.2 * S)
    # Estrellas laterales
    for sy in [25, 36, 56, 67]:
        draw_star4(d, 6.2 * S, sy * S, 0.75 * S, GOLD_DIM)
        draw_star4(d, 17.8 * S, sy * S, 0.75 * S, GOLD_DIM)
    left_full = im_l.resize((24 * PX_MM, 88 * PX_MM), Image.Resampling.LANCZOS)
    # lidLeft cubre y=0..26mm desde arriba; left cubre y=22..88mm desde arriba (solapan los 4mm del corte diagonal)
    left_full.crop((0, 0, 24 * PX_MM, 26 * PX_MM)).save(os.path.join(OUT_DIR, "lidLeft.png"), "PNG", optimize=True)
    left_full.crop((0, 22 * PX_MM, 24 * PX_MM, 88 * PX_MM)).save(os.path.join(OUT_DIR, "left.png"), "PNG", optimize=True)
    manifest["faces"]["lidLeft"] = "skins/celestial/lidLeft.png"
    manifest["faces"]["left"] = "skins/celestial/left.png"

    # 6. LATERAL DERECHO TAPA (24 x 26 mm)
    im, d = new_hi(24, 26)
    draw_frame(d, 24, 26, 2.0, 3.0)
    draw_crescent(d, 12.0 * S, 12.0 * S, 3.0 * S, facing="left")
    draw_star4(d, 12.0 * S, 5.5 * S, 1.1 * S)
    draw_star4(d, 12.0 * S, 19.0 * S, 1.1 * S)
    manifest["faces"]["lidRight"] = save_hi(im, "lidRight", 24, 26)

    # 7. FRENTE BOLSILLO (27 x 83 mm — Lado B, con muesca de 9x22 mm en esquina sup. izq.)
    # En coordenadas de imagen (y=0 arriba, y=83 abajo):
    # La muesca esta en x=[0..9], y=[0..22] (porque H_front-1=61 desde abajo -> 83-61=22 desde arriba)
    im, d = new_hi(27, 83)
    m = 2.0 * S
    notch_x = 9.0 * S
    notch_y = 22.0 * S
    w, h = 27 * S, 83 * S
    poly_frame = [
        (notch_x + m, m),
        (w - m, m),
        (w - m, h - m),
        (m, h - m),
        (m, notch_y + m),
        (notch_x + m, notch_y + m),
    ]
    d.polygon(poly_frame, outline=GOLD, width=max(1, int(0.24 * S)))
    # Eje vertical en la columna despejada derecha (x = 18 mm) y centro inferior (x = 13.5 mm)
    draw_star4(d, 18.0 * S, 8.0 * S, 1.3 * S)
    draw_crescent(d, 18.0 * S, 15.5 * S, 2.6 * S, facing="left")
    # En la parte inferior completa (y = 26..81) centramos en x = 13.5 mm
    cx = 13.5 * S
    d.line([(cx, 28 * S), (cx, 76 * S)], fill=GOLD_DIM, width=max(1, int(0.14 * S)))
    draw_star4(d, cx, 32.0 * S, 1.4 * S)
    draw_sun(d, cx, 50.0 * S, 3.6 * S, 8.2 * S, n_rays=24)
    draw_crescent(d, cx, 67.5 * S, 3.1 * S, facing="right")
    draw_star4(d, cx, 76.0 * S, 1.3 * S)
    for sy in [39, 60]:
        draw_star4(d, 6.2 * S, sy * S, 0.8 * S, GOLD_DIM)
        draw_star4(d, 20.8 * S, sy * S, 0.8 * S, GOLD_DIM)
    manifest["faces"]["pocketFront"] = save_hi(im, "pocketFront", 27, 83)

    # 8. EXTERIOR BOLSILLO (24 x 83 mm — Lado B)
    im, d = new_hi(24, 83)
    draw_frame(d, 24, 83, 2.0, 3.0)
    cx = 12.0 * S
    d.line([(cx, 8 * S), (cx, 75 * S)], fill=GOLD_DIM, width=max(1, int(0.14 * S)))
    draw_star4(d, cx, 8.0 * S, 1.2 * S)
    draw_crescent(d, cx, 18.0 * S, 3.1 * S, facing="right")
    draw_star4(d, cx, 28.5 * S, 1.4 * S)
    draw_sun(d, cx, 41.5 * S, 3.5 * S, 7.6 * S, n_rays=24)
    draw_star4(d, cx, 54.5 * S, 1.4 * S)
    draw_crescent(d, cx, 65.0 * S, 3.1 * S, facing="left")
    draw_star4(d, cx, 75.0 * S, 1.2 * S)
    for sy in [23, 33, 50, 60]:
        draw_star4(d, 6.2 * S, sy * S, 0.75 * S, GOLD_DIM)
        draw_star4(d, 17.8 * S, sy * S, 0.75 * S, GOLD_DIM)
    manifest["faces"]["pocketOuter"] = save_hi(im, "pocketOuter", 24, 83)

    # 9. ESPALDA BOLSILLO (27 x 83 mm — Lado B, estilo cartouche)
    im, d = new_hi(27, 83)
    draw_frame(d, 27, 83, 2.0, 3.0)
    cx = 13.5 * S
    draw_sun(d, cx, 13.5 * S, 2.6 * S, 5.8 * S, n_rays=18)
    draw_sun(d, cx, 69.5 * S, 2.6 * S, 5.8 * S, n_rays=18)
    # Cartouche central limpio
    d.rectangle([5.5 * S, 24 * S, 21.5 * S, 59 * S], outline=GOLD, width=max(1, int(0.2 * S)))
    draw_star4(d, cx, 24 * S, 1.2 * S)
    draw_star4(d, cx, 59 * S, 1.2 * S)
    draw_star4(d, 5.5 * S, 41.5 * S, 1.0 * S)
    draw_star4(d, 21.5 * S, 41.5 * S, 1.0 * S)
    manifest["faces"]["pocketBack"] = save_hi(im, "pocketBack", 27, 83)

    # 10. BASE BOLSILLO (24 x 27 mm — Lado B)
    im, d = new_hi(24, 27)
    draw_frame(d, 24, 27, 2.0, 3.0)
    draw_sun(d, 12.0 * S, 13.5 * S, 2.5 * S, 5.8 * S, n_rays=16)
    for ex, ey in [(6.5, 6.5), (17.5, 6.5), (6.5, 20.5), (17.5, 20.5)]:
        draw_star4(d, ex * S, ey * S, 0.9 * S, GOLD_DIM)
    manifest["faces"]["pocketBase"] = save_hi(im, "pocketBase", 24, 27)

    with open(os.path.join(OUT_DIR, "skin.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("Skin Celestial generado correctamente:", len(manifest["faces"]), "caras.")


if __name__ == "__main__":
    main()
