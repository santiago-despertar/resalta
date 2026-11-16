"""Genera pines verticales de Pinterest (1000x1500) para cada artículo publicado del blog.
Uso: python3 pins.py [slug ...]   (sin slugs: todos los artículos de src/blog)
Salida: assets/img/pins/<slug>-a.jpg y <slug>-b.jpg
"""
import json, re, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).parent
OUT = ROOT / "assets/img/pins"
OUT.mkdir(parents=True, exist_ok=True)
FD = "/usr/share/fonts/opentype/inter/"
W, H = 1000, 1500
SLATE = (110, 126, 142)
SLATE_D = (74, 88, 102)
AZUL = (207, 228, 255)


def font(name, size):
    for p in (ROOT / "assets/fonts" / name, Path(FD) / name):
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def mark(size, color=(255, 255, 255)):
    """Logo de Resalta a partir de mark-white.svg (rasterizado con cairosvg si existe)."""
    try:
        import cairosvg, io
        svg = (ROOT / "assets/img/mark-white.svg").read_text()
        png = cairosvg.svg2png(bytestring=svg.encode(), output_height=size)
        return Image.open(io.BytesIO(png)).convert("RGBA")
    except Exception:
        return None


def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def fit_title(draw, text, maxw, maxlines, start, minsize, fname="InterDisplay-Light.otf"):
    size = start
    while size >= minsize:
        f = font(fname, size)
        lines = wrap(draw, text, f, maxw)
        if len(lines) <= maxlines:
            return f, lines, size
        size -= 4
    f = font(fname, minsize)
    return f, wrap(draw, text, f, maxw), minsize


def cover(img, w, h, fy=0.42):
    """Recorta a w x h manteniendo la cara (centro horizontal, algo arriba)."""
    s = max(w / img.width, h / img.height)
    im = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = int(max(0, min(im.height - h, im.height * fy - h * 0.42)))
    return im.crop((x, y, x + w, y + h))


def brand(canvas, d, x, y, color=(255, 255, 255)):
    m = mark(46)
    if m:
        canvas.paste(m, (x, y), m)
        tx = x + m.width + 14
    else:
        tx = x
    d.text((tx, y + 2), "resalta", font=font("Inter-Regular.otf", 38), fill=color)


def pin_a(meta, photo):
    """Foto arriba, panel azul pizarra abajo con el título (como el OG del blog)."""
    c = Image.new("RGB", (W, H), SLATE)
    ph = 860
    c.paste(cover(photo, W, ph), (0, 0))
    # degradado suave de la foto al panel
    g = Image.new("L", (1, 160))
    for i in range(160):
        g.putpixel((0, i), int(255 * (i / 159) ** 1.6))
    grad = Image.new("RGB", (W, 160), SLATE)
    c.paste(grad, (0, ph - 160), g.resize((W, 160)))
    d = ImageDraw.Draw(c)
    x = 72
    kicker = meta["pilar"].upper()
    d.text((x, ph + 30), " ".join(kicker), font=font("Inter-Medium.otf", 24), fill=(232, 238, 244))
    f, lines, size = fit_title(d, meta["titulo"], W - 2 * x, 4, 74, 50)
    y = ph + 86
    for ln in lines:
        d.text((x, y), ln, font=f, fill=(255, 255, 255))
        y += int(size * 1.12)
    d.text((x, H - 150), "Lee el artículo completo en resalta.co", font=font("Inter-Regular.otf", 28), fill=AZUL)
    brand(c, d, x, H - 92)
    return c


def pin_b(meta, photo):
    """Foto a sangre completa con degradado oscuro y el título abajo."""
    c = cover(photo, W, H, fy=0.40).convert("RGB")
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for i in range(760):
        a = int(235 * (i / 759) ** 1.35)
        od.line([(0, H - 760 + i), (W, H - 760 + i)], fill=SLATE_D + (a,))
    c = Image.alpha_composite(c.convert("RGBA"), ov).convert("RGB")
    d = ImageDraw.Draw(c)
    x = 72
    brand(c, d, x, 70)
    f, lines, size = fit_title(d, meta["titulo"], W - 2 * x, 4, 80, 54, "InterDisplay-Regular.otf")
    y = H - 210 - len(lines) * int(size * 1.12)
    d.text((x, y - 56), " ".join(meta["pilar"].upper()), font=font("Inter-Medium.otf", 24), fill=(232, 238, 244))
    for ln in lines:
        d.text((x, y), ln, font=f, fill=(255, 255, 255))
        y += int(size * 1.12)
    # botón tipo píldora como en el sitio
    btn = "Lee el artículo"
    bf = font("Inter-Medium.otf", 30)
    bw = int(d.textlength(btn, font=bf)) + 64
    d.rounded_rectangle((x, H - 150, x + bw, H - 82), radius=34, fill=(255, 255, 255))
    d.text((x + 32, H - 135), btn, font=bf, fill=(22, 25, 29))
    d.text((x + bw + 24, H - 132), "resalta.co", font=font("Inter-Regular.otf", 28), fill=AZUL)
    return c


def meta_of(slug):
    s = (ROOT / "src/blog" / f"{slug}.html").read_text()
    return json.loads(re.search(r"<!--post (\{.*?\}) -->", s).group(1))


def main(slugs):
    for slug in slugs:
        m = meta_of(slug)
        photo = Image.open(ROOT / m["imagen"].lstrip("/")).convert("RGB")
        pin_a(m, photo).save(OUT / f"{slug}-a.jpg", quality=88, optimize=True, progressive=True)
        pin_b(m, photo).save(OUT / f"{slug}-b.jpg", quality=88, optimize=True, progressive=True)
        print("ok", slug)


if __name__ == "__main__":
    args = sys.argv[1:] or [p.stem for p in sorted((ROOT / "src/blog").glob("*.html"))]
    main(args)
