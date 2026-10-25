#!/usr/bin/env bash
# Icônes PNG de l'application à partir des SVG de web/assets (après brand/generate.py).
set -euo pipefail
cd "$(dirname "$0")/.."
a=web/assets
node brand/render.mjs "$a/helpeo-mark.svg" "$a/helpeo-favicon-32.png" 32
node brand/render.mjs "$a/helpeo-mark-maskable.svg" "$a/helpeo-icon-180.png" 180
node brand/render.mjs "$a/helpeo-mark.svg" "$a/helpeo-icon-192.png" 192
node brand/render.mjs "$a/helpeo-mark.svg" "$a/helpeo-icon-512.png" 512
node brand/render.mjs "$a/helpeo-mark-maskable.svg" "$a/helpeo-icon-maskable-512.png" 512
