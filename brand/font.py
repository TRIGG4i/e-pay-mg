"""Police de l'application : Plus Jakarta Sans variable (200–800), allégée en woff2.

Garde le latin et le latin-1, la ponctuation, l'euro, les flèches et les chiffres tabulaires.
La police d'origine n'a pas d'espace fine insécable (U+202F), séparateur de milliers de
Intl.NumberFormat('fr-FR') : on la fait pointer sur l'espace fine (U+2009), sinon les montants
retombent sur une police système.

Usage : python3 brand/font.py <PlusJakartaSans.ttf> web/assets/fonts/plus-jakarta-sans.woff2
Dépendances : fonttools, brotli. Police : Google Fonts, licence OFL (web/assets/fonts/OFL.txt).
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

SRC, OUT = sys.argv[1], sys.argv[2]
UNICODES = ("U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2009,U+200B,"
            "U+2010-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212")

opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["kern", "liga", "calt", "tnum", "lnum", "case", "ss01"]
opts.hinting = False
font = TTFont(SRC)
sub = subset.Subsetter(opts)
sub.populate(unicodes=subset.parse_unicodes(UNICODES))
sub.subset(font)

thin = font.getBestCmap()[0x2009]
for table in font["cmap"].tables:
    if table.isUnicode():
        table.cmap[0x202F] = thin
font.flavor = "woff2"
font.save(OUT)
print(OUT, "U+202F ->", thin, font["hmtx"][thin])
