# Cook Pilot Command — Fondation vocale

## Principe produit

Cook Pilot Command est piloté par la voix. Le clavier reste une solution de secours. Amar formule une intention, l'orchestrateur identifie le bon agent, prépare ou exécute une action autorisée, puis rend une réponse claire à l'écran et à l'oral.

## Parcours d'une demande

1. Amar appuie sur le micro.
2. Le navigateur transcrit la demande et l'affiche avant traitement.
3. L'orchestrateur détermine l'agent, le niveau de risque et les outils nécessaires.
4. L'agent exécute ou prépare l'action.
5. Command enregistre la mission, les appels outils et le résultat dans le journal d'audit.
6. Les actions sensibles apparaissent dans « À valider par Amar ».
7. Amar valide aussi par la voix : « valide », « envoie », « annule ».

## Exemples d'intentions

- « Nexus, regarde pourquoi La Fabrique Pizza ne se connecte plus. »
- « Atlas, prépare les relances des factures impayées. »
- « Orion, prépare un devis Gestion plus HACCP pour Brasserie du Prado. »
- « Pulse, informe les clients HACCP de la mise à jour du scan DLC. »
- « Montre-moi ce qui exige ma validation aujourd'hui. »

## Règles d'autonomie

### Exécution autonome

Surveillance, analyse, classement, création de ticket, diagnostic, brouillon de message, rapport, synthèse, détection de risque et mise à jour du Journal selon un modèle approuvé.

### Validation obligatoire

Paiement, remboursement, avoir, remise commerciale, suspension de client, changement d'accès, réinitialisation sensible, déploiement production, suppression de données, modification contractuelle et communication massive hors modèle approuvé.

## Première version technique

- Web Speech API dans l'interface pour capter la voix lorsque le navigateur la prend en charge.
- Saisie texte de secours.
- Edge Function `command-orchestrator` : authentification, journalisation, classification de l'intention et création de demande de validation.
- Edge Function `command-speech` : transcription et réponse vocale via fournisseurs configurables, sans clé dans le navigateur.
- Tables `command_voice_requests`, `command_agent_runs`, `command_approvals` et `command_audit_log`.
- Aucun agent ne reçoit les clés d'une autre application Cook Pilot.

## Sécurité

La voix ne sert jamais de preuve unique pour une action sensible. La validation est liée à la session authentifiée, enregistrée avec date, utilisateur, demande et résultat. Les secrets IA, e-mail, paiement et accès techniques restent dans les variables serveur Supabase/Vercel.
