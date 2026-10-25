"""Génère l'identité HELPEO (SVG vectoriels, texte converti en tracés).

Monogramme : un « H » blanc dont la barre est un câble corail tendu entre deux piliers,
sur une tuile verte. C'est un pont : on aide à passer ce qui bloque. C'est aussi un
sourire, celui du problème réglé. Logotype : HELPEO, le O en corail, puis le slogan.

Usage : python3 brand/generate.py <dossier-polices> web/assets, puis brand/icons.sh.
Dépendances : uharfbuzz, fonttools ; police PlusJakartaSans.ttf (variable, Google Fonts, licence OFL).
"""
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

GREEN_A, GREEN_B = "#13866C", "#0A4F42"   # tuile : vert HELPEO, du clair au profond
CORAL = "#FF7A50"                          # le câble du pont, le O
INK, INK_SUB = "#13231F", "#4F6660"        # texte sur fond clair
WHITE_SUB = "#A9C2BA"                      # sous-titre sur fond sombre
TAG = "On vous aide à régler ça"

# Géométrie sur une grille de 512 : deux tours, un câble qui pend (courbe de Bézier quadratique).
LX, RX, TOP, BOT, SW = 168, 344, 140, 372, 60
CABLE_Y, CABLE_CTRL = 222, 350             # attaches du câble, point de contrôle (point bas réel : 286)


def instance(name, wght):
    path = FONTS / f".{name}-{wght}.ttf"
    if not path.exists():
        f = TTFont(FONTS / f"{name}.ttf")
        instantiateVariableFont(f, {"wght": wght}, inplace=True)
        f.save(path)
    return path


def text_paths(font_path, text, size, x0, baseline, tracking=0.0):
    """Tracés SVG par caractère (crénage HarfBuzz) : [(cluster, d)], largeur."""
    face = hb.Face(hb.Blob.from_file_path(str(font_path)))
    font = hb.Font(face)
    upem = face.upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True})
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
    """Tuile + H. En plein cadre (masquable), le H est réduit pour tenir dans la zone sûre d'Android."""
    k = s / 512
    shrink = 0.84 if bleed else 1
    P = lambda x, y: f"{ox + (256 + (x - 256) * shrink) * k:.2f},{oy + (256 + (y - 256) * shrink) * k:.2f}"
    sw = SW * shrink * k
    r = 0 if bleed else 118 * k
    pillars = f"M{P(LX, TOP)}L{P(LX, BOT)}M{P(RX, TOP)}L{P(RX, BOT)}"
    cable = f"M{P(LX, CABLE_Y)}Q{P(256, CABLE_CTRL)} {P(RX, CABLE_Y)}"
    return f"""
  <rect x="{ox:.2f}" y="{oy:.2f}" width="{s:.2f}" height="{s:.2f}" rx="{r:.2f}" fill="url(#hpTile)"/>
  <path d="{pillars}" fill="none" stroke="#FFFFFF" stroke-width="{sw:.2f}" stroke-linecap="round"/>
  <path d="{cable}" fill="none" stroke="{CORAL}" stroke-width="{sw:.2f}" stroke-linecap="round"/>"""


def defs(s=512, ox=0, oy=0):
    return f"""
  <defs>
    <linearGradient id="hpTile" x1="{ox:.2f}" y1="{oy:.2f}" x2="{ox + s:.2f}" y2="{oy + s:.2f}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{GREEN_A}"/><stop offset="1" stop-color="{GREEN_B}"/>
    </linearGradient>
  </defs>"""


def svg(w, h, body, title="HELPEO"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}\n</svg>\n')


heavy = instance("PlusJakartaSans", 800)
semi = instance("PlusJakartaSans", 600)


def word(x0, baseline, ink, size=104):
    """« HELPEO » : lettres à l'encre, O en corail."""
    glyphs, w = text_paths(heavy, "HELPEO", size, x0, baseline, tracking=0.015)
    letters = "".join(d for c, d in glyphs if c != 5)
    o = "".join(d for c, d in glyphs if c == 5)
    return f'\n  <path d="{letters}" fill="{ink}"/>\n  <path d="{o}" fill="{CORAL}"/>', w


def tagline(x0, baseline, color, size=22):
    """Slogan sous le logotype, plus discret que lui."""
    glyphs, _ = text_paths(semi, TAG, size, x0, baseline, tracking=0.005)
    return f'\n  <path d="{"".join(d for _, d in glyphs)}" fill="{color}"/>'


(OUT / "helpeo-mark.svg").write_text(svg(512, 512, defs() + mark_shapes()))
(OUT / "helpeo-mark-maskable.svg").write_text(svg(512, 512, defs() + mark_shapes(bleed=True)))


def lockup(ink, sub, name):
    m, x0 = 160, 196
    body, w = word(x0, 96, ink)
    body += tagline(x0 + 4, 138, sub)
    (OUT / name).write_text(svg(x0 + w + 6, 160, defs(m) + mark_shapes(m) + body))


lockup(INK, INK_SUB, "helpeo-logo.svg")
lockup("#FFFFFF", WHITE_SUB, "helpeo-logo-light.svg")
body, w = word(0, 100, INK)
(OUT / "helpeo-wordmark.svg").write_text(svg(w + 4, 124, body))
print(sorted(p.name for p in OUT.glob("helpeo-*.svg")))
