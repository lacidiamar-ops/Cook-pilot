# Cook Pilot Command V1

Ce dépôt accueille uniquement Cook Pilot Command : le cockpit interne de supervision technique, commerciale et financière de la marque Cook Pilot.

Les dépôts `cook-pilot-gestion`, `cook-pilot-haccp` et `cook-pilot-human` restent séparés et ne sont pas modifiés par ce dépôt.

## Version actuellement déposée

- interface de cockpit direction / support ;
- restaurants, adoption et état des applications ;
- support, incidents et diagnostics ;
- six agents IA et validations ;
- prospects, devis et aperçu de PDF premium ;
- facturation, dépenses et suivi des impayés ;
- parc matériel : tablettes, thermomètres connectés, imprimantes et scanners EAN ;
- Journal Cook Pilot ;
- réglages et connexions techniques.

La V1 est une interface de démonstration fonctionnelle côté navigateur. Les données affichées sont fictives tant que Supabase, les Edge Functions et les connecteurs e-mail, IA et paiement ne sont pas raccordés.

## Déploiement rapide

Le dépôt est une application statique : Vercel peut la publier directement à partir de `index.html`.

Avant le passage en production, ajouter les migrations Supabase, les secrets serveur et les connecteurs réels sans jamais placer de clé secrète dans le navigateur.
