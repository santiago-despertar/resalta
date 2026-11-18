"""Genera la imagen Open Graph (1200x630) de cada artículo del blog, con el mismo diseño de los OG existentes:
panel azul pizarra a la izquierda con logo, pilar y título; la foto del artículo a la derecha con degradado.
Uso: python3 og.py [slug ...]   (sin slugs: solo los artículos que todavía no tienen OG)
     python3 og.py --todos      (rehace todos)
Salida: assets/img/og/blog-<slug>.jpg
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

from pins import ROOT, SLATE, font, mark, meta_of

OUT = ROOT / "assets/img/og"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1200, 630
PW = 640  # ancho de la foto a la derecha
FADE = 220
GRIS = (226, 232, 238)


def cover(img, w, h):
    """Recorta a w x h centrando la cara (las fotos del blog la tienen en el centro, algo arriba)."""
    s = max(w / img.width, h / img.height) * 1.0
    im = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = (im.width - w) // 2 - int(w * 0.05)
    y = int(max(0, min(im.height - h, im.height * 0.0)))
    return im.crop((x, y, x + w, y + h))


def tracked(d, xy, text, fnt, fill, track):
    """Texto con espaciado negativo, como el título del sitio (letter-spacing -0.03em)."""
    x, y = xy
    for i, ch in enumerate(text):
        d.text((x, y), ch, font=fnt, fill=fill)
        nxt = text[i:i + 2]
        adv = d.textlength(nxt, font=fnt) - d.textlength(text[i + 1:i + 2], font=fnt) if len(nxt) == 2 else d.textlength(ch, font=fnt)
        x += adv + track


def twidth(d, text, fnt, track):
    return d.textlength(text, font=fnt) + track * max(0, len(text) - 1)


def twrap(d, text, fnt, maxw, track):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if twidth(d, t, fnt, track) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def og(meta, photo):
    c = Image.new("RGB", (W, H), SLATE)
    ph = cover(photo, PW, H)
    mask = Image.new("L", (PW, H), 255)
    md = ImageDraw.Draw(mask)
    for i in range(FADE):
        md.line([(i, 0), (i, H)], fill=int(255 * (i / (FADE - 1)) ** 1.5))
    c.paste(ph, (W - PW, 0), mask)
    d = ImageDraw.Draw(c)
    x = 72
    m = mark(38)
    if m:
        c.paste(m, (x, 62), m)
    d.text((x + (m.width + 14 if m else 0), 62), "resalta", font=font("Inter-Light.otf", 34), fill=(255, 255, 255))
    maxw = W - PW + 60 - x
    size = 52
    while size >= 38:
        f = font("InterDisplay-Light.otf", size)
        tr = -size * 0.035
        lines = twrap(d, meta["titulo"], f, maxw, tr)
        if len(lines) <= 3:
            break
        size -= 2
    lh = int(size * 1.08)
    y_url = 552
    y = y_url - 28 - len(lines) * lh
    tracked(d, (x, y - 46), meta["pilar"].upper(), font("Inter-Medium.otf", 16), GRIS, 5.2)
    for ln in lines:
        tracked(d, (x, y), ln, f, (255, 255, 255), tr)
        y += lh
    d.text((x, y_url), "resalta.co/blog", font=font("Inter-Regular.otf", 19), fill=GRIS)
    return c


def main(slugs):
    for slug in slugs:
        m = meta_of(slug)
        photo = Image.open(ROOT / m["imagen"].lstrip("/")).convert("RGB")
        og(m, photo).save(OUT / f"blog-{slug}.jpg", quality=88, optimize=True, progressive=True)
        print("ok", slug)


if __name__ == "__main__":
    args = sys.argv[1:]
    todos = [p.stem for p in sorted((ROOT / "src/blog").glob("*.html"))]
    if args == ["--todos"]:
        args = todos
    elif not args:
        args = [s for s in todos if not (OUT / f"blog-{s}.jpg").exists()]
    main(args)
