# Identité E-Pay MG

- Marque : **E-Pay MG**, paiements en devise depuis Madagascar.
- Même famille visuelle qu'eVidy (tuile encre, tracé blanc, un accent de couleur) ;
  l'accent d'E-Pay est le bleu de l'interface, celui d'eVidy l'or.

## Monogramme

- Tuile encre arrondie (`#1D2330 → #0E1118 → #06070A`, rayon 23 %).
- « ϵ » blanc : le E d'E-Pay, dans la forme des signes monétaires.
- Barre bleue (`#9AABFF → #5B78FF`) qui traverse l'ouverture et sort à droite :
  le tiret d'E-Pay et le paiement qui part vers l'étranger.
- Version masquable plein cadre pour Android (contenu dans la zone sûre de 80 %).

## Logotype

- « E-Pay » en Manrope 800, tiret bleu ; « MG » en Manrope 700 espacé, bleu
  `#4560F0` sur fond clair, `#8EA1FF` sur fond sombre. Texte converti en tracés.

## Fichiers (`web/assets/`)

- `epay-mark.svg`, `epay-mark-maskable.svg` : monogramme.
- `epay-logo.svg` (fond clair), `epay-logo-light.svg` (fond sombre), `epay-wordmark.svg`.
- Icônes : `favicon-32.png`, `app-icon-180.png` (Apple), `app-icon-192.png`,
  `app-icon-512.png`, `app-icon-maskable-512.png`.
- Le même dessin est repris en ligne dans l'aperçu et l'impression des devis
  (`index.html`, `app-core.js`) et sur les images PNG (`export-image.js`).

## Régénérer

```sh
python3 brand/generate.py <dossier avec Manrope.ttf> web/assets   # SVG
brand/icons.sh                                                     # PNG
```

Si les icônes changent encore, les renommer : les téléphones gardent en cache
les icônes d'une application installée tant que leur adresse ne change pas.
