#!/usr/bin/env bash
# Icônes PNG de l'application à partir des SVG de web/assets (après brand/generate.py).
# Le suffixe de version change avec le dessin : un téléphone garde en cache une icône tant que son adresse ne change pas.
set -euo pipefail
cd "$(dirname "$0")/.."
a=web/assets v=v2
node brand/render.mjs "$a/helpeo-mark-$v.svg" "$a/helpeo-favicon-32-$v.png" 32
node brand/render.mjs "$a/helpeo-mark-maskable-$v.svg" "$a/helpeo-icon-180-$v.png" 180
node brand/render.mjs "$a/helpeo-mark-$v.svg" "$a/helpeo-icon-192-$v.png" 192
node brand/render.mjs "$a/helpeo-mark-$v.svg" "$a/helpeo-icon-512-$v.png" 512
node brand/render.mjs "$a/helpeo-mark-maskable-$v.svg" "$a/helpeo-icon-maskable-512-$v.png" 512
