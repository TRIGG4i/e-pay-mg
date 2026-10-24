"""Génère le logo E-Pay MG (SVG vectoriels, texte converti en tracés).

Même famille que eVidy : tuile encre, tracé blanc, accent de couleur.
Monogramme : « ϵ » blanc (E de E-Pay, forme des signes monétaires) traversé par
une barre bleue qui sort vers la droite (le tiret de E-Pay, le paiement qui part).

Usage : python3 brand/generate.py <dossier-polices> web/assets, puis brand/icons.sh.
Dépendances : uharfbuzz, fonttools ; police Manrope.ttf (variable, Google Fonts, licence OFL).
"""
import math
import sys
from pathlib import Path
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

INK = "#0B0D12"
BLUE_A, BLUE_B = "#9AABFF", "#5B78FF"
BLUE_TEXT, BLUE_TEXT_DARK = "#4560F0", "#8EA1FF"

# Géométrie sur une grille de 512.
CX, CY, R, SW = 216, 256, 112, 56          # anneau : centre, rayon (axe), épaisseur
GAP = 18                                     # jour entre la barre et les extrémités de l'anneau
THETA = math.degrees(math.asin((SW / 2 + SW / 2 + GAP) / R))  # ouverture à droite, de part et d'autre
BAR_X0 = CX - R + SW / 2 + GAP + SW / 2      # barre : part de l'intérieur, sans toucher l'anneau
BAR_X1 = 422                                 # … et sort à droite


def instance(name, wght):
    path = FONTS / f".{name}-{wght}.ttf"
    if not path.exists():
        f = TTFont(FONTS / f"{name}.ttf")
        instantiateVariableFont(f, {"wght": wght}, inplace=True)
        f.save(path)
    return path


def text_paths(font_path, text, size, x0, baseline, tracking=0.0):
    """Tracés SVG par caractère (crénage HarfBuzz) : [(cluster, d)], largeur."""
    blob = hb.Blob.from_file_path(str(font_path))
    face = hb.Face(blob)
    font = hb.Font(face)
    upem = face.upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    tt = TTFont(font_path)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    scale = size / upem
    out, x = [], 0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = SVGPathPen(gs)
        tp = TransformPen(pen, (scale, 0, 0, -scale, x0 + (x + pos.x_offset) * scale, baseline - pos.y_offset * scale))
        gs[order[info.codepoint]].draw(tp)
        out.append((info.cluster, pen.getCommands()))
        x += pos.x_advance + tracking * upem
    return out, (x - tracking * upem) * scale


def mark_shapes(s=512, ox=0, oy=0, bleed=False):
    k = s / 512
    r = 0 if bleed else 118 * k
    P = lambda x, y: f"{ox + x * k:.2f},{oy + y * k:.2f}"
    t = math.radians(THETA)
    top = P(CX + R * math.cos(t), CY - R * math.sin(t))
    bot = P(CX + R * math.cos(t), CY + R * math.sin(t))
    ring = f"M{top} A{R * k:.2f},{R * k:.2f} 0 1 0 {bot}"
    bar = f"M{P(BAR_X0, CY)} L{P(BAR_X1, CY)}"
    return f"""
  <rect x="{ox:.2f}" y="{oy:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{r:.2f}" fill="url(#epInk)"/>
  <rect x="{ox + 1.5 * k:.2f}" y="{oy + 1.5 * k:.2f}" width="{s - 3 * k:.2f}" height="{s - 3 * k:.2f}" rx="{max(r - 1.5 * k, 0):.2f}" fill="none" stroke="#FFFFFF" stroke-opacity=".07" stroke-width="{3 * k:.2f}"/>
  <path d="{ring}" fill="none" stroke="url(#epStroke)" stroke-width="{SW * k:.2f}" stroke-linecap="round"/>
  <path d="{bar}" fill="none" stroke="url(#epBlue)" stroke-width="{SW * k:.2f}" stroke-linecap="round"/>"""


def defs(s=512, ox=0, oy=0):
    k = s / 512
    return f"""
  <defs>
    <linearGradient id="epInk" x1="{ox:.2f}" y1="{oy:.2f}" x2="{ox + s:.2f}" y2="{oy + s:.2f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1D2330"/><stop offset=".55" stop-color="#0E1118"/><stop offset="1" stop-color="#06070A"/>
    </linearGradient>
    <linearGradient id="epStroke" x1="{ox + 114 * k:.2f}" y1="{oy + 368 * k:.2f}" x2="{ox + 338 * k:.2f}" y2="{oy + 144 * k:.2f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E9ECF2"/>
    </linearGradient>
    <linearGradient id="epBlue" x1="{ox + BAR_X0 * k:.2f}" y1="0" x2="{ox + BAR_X1 * k:.2f}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{BLUE_A}"/><stop offset="1" stop-color="{BLUE_B}"/>
    </linearGradient>
  </defs>"""


def svg(w, h, body, title="E-Pay MG"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}\n</svg>\n')


bold = instance("Manrope", 800)
semi = instance("Manrope", 700)

(OUT / "epay-mark.svg").write_text(svg(512, 512, defs() + mark_shapes()))
(OUT / "epay-mark-maskable.svg").write_text(svg(512, 512, defs() + mark_shapes(bleed=True)))


def word(x0, baseline, ink, blue):
    """« E-Pay » (tiret bleu, comme la barre du monogramme) + « MG »."""
    glyphs, w = text_paths(bold, "E-Pay", 112, x0, baseline, tracking=-0.018)
    dash = "".join(d for c, d in glyphs if c == 1)
    rest = "".join(d for c, d in glyphs if c != 1)
    mg_x = x0 + w + 22
    mg, mg_w = text_paths(semi, "MG", 46, mg_x, baseline, tracking=0.12)
    body = f'\n  <path d="{rest}" fill="{ink}"/>\n  <path d="{dash}" fill="{blue}"/>\n  <path d="{"".join(d for _, d in mg)}" fill="{blue}"/>'
    return body, mg_x + mg_w + 4


def lockup(ink, blue, name):
    m = 160
    body, W = word(m + 40, 116, ink, blue)
    (OUT / name).write_text(svg(W, 160, defs(m) + mark_shapes(m) + body))


lockup(INK, BLUE_TEXT, "epay-logo.svg")
lockup("#FFFFFF", BLUE_TEXT_DARK, "epay-logo-light.svg")
body, W = word(0, 104, INK, BLUE_TEXT)
(OUT / "epay-wordmark.svg").write_text(svg(W, 132, body))
print(f"ouverture ±{THETA:.1f}°, barre {BAR_X0:.0f}→{BAR_X1}", sorted(p.name for p in OUT.glob("*.svg")))
