# COOK PILOT — FEUILLE DE ROUTE LIVRAISON

Mise à jour : 16 août 2026

## Règle de statut
- 🔴 BLOQUANT : empêche l'utilisation ou la livraison
- 🟠 À TESTER : correction codée/déployée mais validation utilisateur réelle nécessaire
- 🟡 À FINALISER : fonction présente mais audit/finition nécessaire
- 🟢 TESTÉ : contrôlé techniquement et validé en production
- ⚪ À FAIRE : non traité

## BLOC 0 — ACCÈS & SAAS — PRIORITÉ CRITIQUE

| Mission | Statut | État |
|---|---|---|
| Compte SaaS Amar relié Center + Safe + Human | 🟢 TESTÉ | Droits owner actifs sur les 3 modules |
| Profil manager Safe relié au compte Center | 🟢 TESTÉ | auth_uid corrigé en base |
| Profil manager Human relié au compte Center | 🟢 TESTÉ | auth_uid corrigé en base |
| Human — liste des profils salariés | 🟢 TESTÉ | RPC réparée et profils retournés |
| Center → Safe manager sans 2e PIN | 🟠 À TESTER | SSO codé, déployé READY |
| Center → Human manager sans 2e PIN | 🟠 À TESTER | SSO codé, déployé READY |
| Center — mot de passe oublié | 🟠 À TESTER | écran de récupération corrigé et READY |
| Supabase Auth Site URL / Redirect URLs | 🔴 BLOQUANT | réglage Dashboard Supabase à finaliser manuellement |
| Nouveau client SaaS créé sans ouvrir Supabase | ⚪ À FAIRE | onboarding client automatisé à finaliser |

## BLOC 1 — SAFE / HACCP

| Mission | Statut | État |
|---|---|---|
| Commande vocale températures | 🟠 À TESTER | fallback local ajouté ; ne doit plus répondre « pas compris » si température exploitable |
| Températures négatives congélateurs | 🟠 À TESTER | « moins 18 » conservé en -18 |
| Deepgram pour commandes micro | 🟡 À FINALISER | présent ; audit réel sur tablette à faire |
| Ajouter frigo / armoire froide / congélateur | 🟠 À TESTER | interface déjà codée ; visible au manager après correction SSO |
| Supprimer un équipement froid | 🟠 À TESTER | interface présente |
| Synchroniser nouveaux équipements avec Lina | 🟠 À TESTER | contexte dynamique présent |
| Zones de nettoyage ajout/suppression | 🟡 À FINALISER | code présent ; test utilisateur requis |
| Voix nettoyage avec zones personnalisées | 🟡 À FINALISER | test utilisateur requis |
| Photo réception / compression / OCR | 🟡 À FINALISER | code présent ; audit terrain requis |
| Réception, cuisson, distribution, huiles, décongélation | 🟡 À FINALISER | test fonctionnel complet à dérouler |
| DDPP / anomalies / PMS / traçabilité | 🟡 À FINALISER | audit fonctionnel complet à dérouler |
| PDF / impression / CSV Safe | 🟡 À FINALISER | design premium présent ; contrôler contenu réel et pagination |

## BLOC 2 — HUMAN / RH

| Mission | Statut | État |
|---|---|---|
| Chargement des profils salariés | 🟢 TESTÉ | correction base validée |
| Connexion salarié par profil + PIN | 🟡 À FINALISER | backend présent ; test navigateur/téléphone requis |
| Accès manager depuis Center | 🟠 À TESTER | vrai SSO sans second PIN déployé READY |
| Planning | 🟡 À FINALISER | test CRUD et responsive requis |
| Pointages | 🟡 À FINALISER | test réel requis |
| Congés / absences | 🟡 À FINALISER | test réel requis |
| Documents / paie / profil | 🟡 À FINALISER | test réel requis |
| William / commandes vocales | 🟡 À FINALISER | audit réel requis |
| PDF / impression / CSV Human | 🟡 À FINALISER | design premium présent ; contrôler données/pagination |

## BLOC 3 — CENTER / GESTION

| Mission | Statut | État |
|---|---|---|
| Login email + mot de passe | 🟠 À TESTER | compte réel actif |
| Mot de passe oublié / nouveau mot de passe | 🟠 À TESTER | code corrigé ; dépend du réglage URL Supabase |
| Sélection établissement | 🟡 À FINALISER | audit multi-client requis |
| Dashboard / KPI | 🟡 À FINALISER | audit données réel requis |
| Factures / BL / achats / stocks / inventaires | 🟡 À FINALISER | recette fonctionnelle complète à dérouler |
| Hector | 🟡 À FINALISER | test des actions et droits à dérouler |
| Lancement Safe/Human | 🟠 À TESTER | SSO nouvellement corrigé |
| Administration SaaS / création client | ⚪ À FAIRE | parcours sans Supabase à terminer |
| PDF / impression / CSV Center | 🟡 À FINALISER | design premium présent ; contrôler données/pagination |

## BLOC 4 — EXPORTS PREMIUM DES 3 APPS

À contrôler pour chaque document :
- logo officiel de l'application ;
- nom établissement ;
- titre du registre/document ;
- période/date ;
- utilisateur / responsable si pertinent ;
- tableaux complets sans colonnes coupées ;
- pagination A4 portrait/paysage intelligente ;
- en-tête et pied de page ;
- numéros de page ;
- caractères français ;
- PDF réel multipage ;
- impression navigateur ;
- CSV UTF-8 BOM + séparateur compatible Excel France ;
- aucun bouton/menu visible à l'impression.

Statut global : 🟡 À FINALISER

## BLOC 5 — DESIGN / LOGOS / PWA

| Mission | Statut |
|---|---|
| Design premium Center | 🟢 TESTÉ techniquement |
| Design premium Safe | 🟢 TESTÉ techniquement |
| Design premium Human | 🟢 TESTÉ techniquement |
| Logos officiels dans interfaces | 🟡 À FINALISER — audit cache/PWA |
| Logos officiels dans PDF | 🟡 À FINALISER |
| Icônes PWA installées | 🟡 À FINALISER — test Android/tablette |
| Responsive tablette/téléphone | 🟡 À FINALISER |

## BLOC 6 — RECETTE FINALE AVANT LIVRAISON

Ordre obligatoire :
1. Accès Center.
2. Reset mot de passe Center.
3. Center → Safe manager.
4. Center → Human manager.
5. Human salarié profil + PIN.
6. Safe salarié/tablette + PIN.
7. Safe : température positive et négative en vocal.
8. Safe : créer/supprimer un frigo ou congélateur puis le reconnaître en vocal.
9. Safe : réception photo/OCR.
10. Human : pointage/planning/congé/document.
11. Center : factures/achats/stocks/devis/Hector.
12. Exports PDF/CSV/impression sur les 3 apps.
13. Test mobile/tablette/PWA et cache propre.
14. Création d'un faux nouveau restaurant client de bout en bout.
15. Livraison seulement lorsque tous les blocs critiques sont 🟢 TESTÉ.

## PROCHAINE MISSION

**Mission active : BLOC 0 + BLOC 1**
- valider le SSO Center → Safe/Human ;
- finaliser le réglage Auth Supabase ;
- tester la voix Safe et la création d'équipements froids en situation réelle.
