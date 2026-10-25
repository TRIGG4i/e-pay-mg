# HELPEO

HELPEO, un service de PREST OFFICE SARL (anciennement E-Pay MG). Cette application gère l'activité : prix
client au taux VISA du jour (EUR, USD), réception depuis l'étranger, devis, opérations (règlement du client,
exécution, confirmation), fiches clients, suivi et réglages.
Identité visuelle : `docs/BRAND.md`.

- **Application** (`web/`) : PWA statique publiée par GitHub Pages, https://trigg4i.github.io/e-pay-mg/.
  Fonctionne hors ligne ; les données restent dans le navigateur tant que la synchronisation n'est pas activée.
- **Serveur** (`server/`) : Node ≥ 22.5 ; `playwright-core` sert seulement à lire VISA par navigateur. Taux VISA
  de base dans les deux sens (`/api/rates` : `rates` pour l'achat, `receive` pour la réception ; le navigateur ne
  peut pas appeler VISA directement), synchronisation privée entre appareils protégée par un mot de passe
  (SQLite, sauvegarde quotidienne), numérotation sans doublon. Les données ne sont jamais dans ce dépôt.

## Modules

| Fichier | Rôle |
|---|---|
| `web/assets/pricing.js` | Moteur de prix (tarifs client, réception, coût interne), partagé avec les tests |
| `web/assets/app-core.js` | Calcul, taux, devis (modifier, actualiser le taux, image, PDF, WhatsApp) |
| `web/assets/operations.js` | Opérations : étapes, règlements, exécution, bénéficiaire, reçu |
| `web/assets/clients.js` | Fiches clients, historique, créées automatiquement |
| `web/assets/dashboard.js` | Suivi : chiffres du mois, à faire, étapes, encaissé et bénéfice par mois |
| `web/assets/settings.js` | Réglages (entreprise, règlement, tarifs, réception, coûts, taux manuels, messages), compte, sauvegarde |
| `web/assets/sync.js` | Synchronisation avec le serveur |

## Commandes

```sh
npm test                                  # moteur de prix, base, cohérence de la page
node server/server.mjs                    # serveur (PORT=4281, EPAY_DATA_DIR=~/apps/epay-data)
node server/admin.mjs activation --html <fichier> --secret <fichier>   # lien d'activation à usage unique
node server/admin.mjs status              # état de la base, sans contenu
```

Déploiement sur le VPS : missions `epay` et `epay-activation` du dépôt `zero`. Les noms techniques (`epay`,
`EPAY_*`, clés `epay…` du navigateur) restent inchangés pour garder les données et les installations.
