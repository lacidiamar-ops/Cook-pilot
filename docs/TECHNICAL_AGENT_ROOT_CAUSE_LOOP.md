# Agent technique Cook Pilot — boucle de réparation à la racine

## Règle non négociable

Un correctif ne ferme jamais un incident parce que l'erreur visible a disparu. L'Agent technique doit démontrer une cause racine, vérifier les dépendances touchées et valider l'absence de régression avant de proposer une mise en production.

Un workaround peut limiter un impact client, mais il reste identifié comme temporaire. Il ne peut ni clôturer l'incident ni être présenté comme une réparation définitive.

## Boucle obligatoire

1. **Observer** : collecter les événements, logs, version déployée, scope impacté, restaurant(s) touché(s) et date de première apparition.
2. **Reproduire** : créer ou retrouver un scénario reproductible. Quand l'incident est intermittent, documenter le déclencheur et les conditions connues.
3. **Cartographier** : identifier les services, tables, Edge Functions, API, rôles, permissions et intégrations concernés.
4. **Formuler** : produire plusieurs hypothèses et préciser les preuves qui peuvent confirmer ou invalider chacune.
5. **Expérimenter** : tester une hypothèse dans un environnement isolé. Aucun changement production à cette étape.
6. **Confirmer la cause racine** : documenter le mécanisme exact, le composant responsable et le rayon d'impact.
7. **Concevoir la réparation** : modifier la cause, pas seulement le symptôme. Prévoir un rollback explicite.
8. **Vérifier** : exécuter les tests de la fonctionnalité réparée, les contrats API, les permissions, les cas d'échec et les scénarios multi-tenant.
9. **Tester les régressions** : exécuter le test en preview ou staging. Le résultat doit être enregistré dans Command.
10. **Canary** : après validation d'Amar, déployer progressivement, surveiller les signaux clés, puis fermer seulement après stabilité observée.

## Critères bloquants

L'Agent technique ne peut pas demander une mise en production tant que l'un des points suivants manque :

- cause racine documentée ;
- scénario reproduit ou incident intermittent qualifié ;
- cartographie des dépendances ;
- plan de rollback ;
- test de la correction réussi hors production ;
- tests de régression réussis ;
- validation explicite d'Amar pour le déploiement production.

## Sortie standard de l'agent technique

Chaque boucle doit produire :

- symptôme observé ;
- services et restaurants impactés ;
- preuve de reproduction ;
- hypothèses écartées ;
- cause racine et niveau de confiance ;
- réparation proposée ;
- composants à risque de régression ;
- plan de tests ;
- plan de rollback ;
- décision demandée à Amar, uniquement au moment du passage production.

## États Command

`observed → reproducing → investigating → root_cause_confirmed → fix_designed → verifying → regression_testing → canary → closed`

`blocked` reste possible lorsque les preuves sont insuffisantes. Dans ce cas, l'agent remonte ce qui manque au lieu de poser un patch spéculatif.
