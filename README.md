# E-Pay MG

Gestion des paiements en devise (EUR, USD) depuis Madagascar : calcul du prix client au taux VISA du jour,
devis, opérations (paiement du client → transfert → confirmation), fiches clients, suivi et réglages.

- **Application** (`web/`) : PWA statique publiée par GitHub Pages, https://trigg4i.github.io/e-pay-mg/.
  Fonctionne hors ligne ; les données restent dans le navigateur tant que la synchronisation n'est pas activée.
- **Serveur** (`server/`) : Node ≥ 22.5, sans dépendance. Taux VISA de base (`/api/rates`, le navigateur ne
  peut pas appeler VISA directement), synchronisation privée entre appareils protégée par un mot de passe
  (SQLite, sauvegarde quotidienne), numérotation sans doublon. Les données ne sont jamais dans ce dépôt.

## Modules

| Fichier | Rôle |
|---|---|
| `web/assets/pricing.js` | Moteur de prix (tarifs client et coût interne), partagé avec les tests |
| `web/assets/app-core.js` | Calcul, taux, devis (modifier, actualiser le taux, image, PDF, WhatsApp) |
| `web/assets/operations.js` | Opérations : étapes, paiements, envoi, bénéficiaire, reçu |
| `web/assets/clients.js` | Fiches clients, historique, créées automatiquement |
| `web/assets/dashboard.js` | Suivi : chiffres du mois, à faire, étapes, encaissé et bénéfice par mois |
| `web/assets/settings.js` | Réglages (entreprise, paiement, tarifs, coûts, taux manuels, messages), compte, sauvegarde |
| `web/assets/sync.js` | Synchronisation avec le serveur |

## Commandes

```sh
npm test                                  # moteur de prix, base, cohérence de la page
node server/server.mjs                    # serveur (PORT=4281, EPAY_DATA_DIR=~/apps/epay-data)
node server/admin.mjs activation --html <fichier> --secret <fichier>   # lien d'activation à usage unique
node server/admin.mjs status              # état de la base, sans contenu
```

Déploiement sur le VPS : missions `epay` et `epay-activation` du dépôt `zero`.
