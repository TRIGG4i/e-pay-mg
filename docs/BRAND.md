# Identité HELPEO

- Marque : **HELPEO**, un service de PREST OFFICE SARL (anciennement E-Pay MG).
- Slogan : « Besoin d’aide ? On est là » (espace fine insécable avant le point
  d’interrogation).
- Vocabulaire : HELPEO est un service d'aide. Les textes vus par les clients (devis, reçus,
  messages, page, icône) ne parlent ni de paiement ni de transfert : on écrit règlement,
  opération, exécution. Un test (`tests/web-consistency.test.mjs`) le vérifie.
- Pied des documents, une seule ligne : « HELPEO, un service de PREST OFFICE SARL ».
  Le haut du document porte le logo et le slogan, rien d'autre sur PREST OFFICE.

## Monogramme

- Tuile verte arrondie, dégradé `#13866C → #0A4F42`, rayon 23 %.
- Un H formé de deux personnes : une tête ronde, un corps, et entre elles un bras corail.
  L'une tend la main à l'autre : c'est ce que fait HELPEO.
- Version masquable plein cadre pour Android (H réduit à 84 %, dans la zone sûre).

## Logotype

- HELPEO en Plus Jakarta Sans 800 : HELP à l'encre, EO en corail, pour qu'on lise d'abord
  « help ». Slogan dessous en 600, plus petit. Dans l'app, `brandHTML()` fait de même.
- Texte converti en tracés : les SVG s'affichent sans la police.

## Couleurs

| Rôle | Clair | Sombre |
|---|---|---|
| Fond | `#F5F3EC` (sable) | `#0A1412` |
| Encre | `#13231F` | |
| Vert HELPEO | `#0E7A62` | `#3DC39D` |
| Corail | `#FF7A50` | `#FF8A63` |
| Info, succès, alerte, danger | `#2D5FB4`, `#12774D`, `#965A00`, `#B3233A` | |

## Police

Plus Jakarta Sans variable (200 à 800), licence OFL, servie par l'app
(`web/assets/fonts/plus-jakarta-sans.woff2`, 25 Ko, sous-ensemble latin produit par
`brand/font.py`). Deux réglages dans `helpeo.css` :

- `text-rendering: geometricPrecision` et `word-spacing: .05em` : l'espace de cette police
  est très étroite (0,17 em) ; sans eux, Chromium sous Linux arrondit les positions au pixel
  et colle des mots, surtout à l'impression.
- U+202F (espace fine insécable, séparateur de milliers de `Intl.NumberFormat('fr-FR')`)
  manque dans la police d'origine ; `font.py` la fait pointer sur l'espace fine (U+2009).

## Fichiers (`web/assets/`)

- `helpeo-mark-v2.svg`, `helpeo-mark-maskable-v2.svg` : monogramme.
- `helpeo-logo.svg` (fond clair), `helpeo-logo-light.svg` (fond sombre), `helpeo-wordmark.svg`.
- Icônes : `helpeo-favicon-32-v2.png`, `helpeo-icon-180-v2.png` (Apple), `helpeo-icon-192-v2.png`,
  `helpeo-icon-512-v2.png`, `helpeo-icon-maskable-512-v2.png`.
- Le monogramme est repris en ligne dans l'aperçu et l'impression des devis (`app-core.js`)
  et dans les images PNG (`export-image.js`).

## Régénérer

```sh
python3 brand/generate.py <dossier avec PlusJakartaSans.ttf> web/assets   # SVG (uharfbuzz, fonttools)
brand/icons.sh                                                            # PNG
python3 brand/font.py PlusJakartaSans.ttf web/assets/fonts/plus-jakarta-sans.woff2
```

Si le monogramme change, changer le suffixe de version (`generate.py`, `icons.sh`, `index.html`,
`manifest.webmanifest`) : un téléphone garde en cache les icônes d'une application installée
tant que leur adresse ne change pas. `icons.sh` a besoin de `playwright-core` (`npm ci`).
