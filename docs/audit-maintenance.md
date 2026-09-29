# Audit du module de maintenance — Flight Director

Audit en lecture seule (aucun code modifié, rien déployé). Lecture statique du code et de `firestore.rules`; aucune exécution. Les points marqués **(à vérifier)** n'ont pas été confirmés à l'exécution. Chemins relatifs à `src/features/` sauf mention contraire.

## 1. Modèle de données Firestore

Types : `fleet/types.ts`. Lectures/écritures : `fleet/firestore.ts`. Règles : `firestore.rules` (lignes ~52-75 et ~382-453).

| Collection | Contenu | Notes |
|---|---|---|
| `aircraft` | immatriculation, modèle, `status` (7 valeurs : Disponible, Maintenance planifiée, En maintenance, Retour en service retardé, Hors service, Inspection, SNAG), `blockedForScheduling`, `hobbsTotal`, `airTimeTotal`, dates d'immobilisation/retour | « Retour en service retardé » est aussi dérivé côté client (`maintenance/MaintenancePage.tsx`). |
| `maintenanceTasks` | les échéances : titre, catégorie, `dueBasis` (Air Time / Date / Air Time et date / Condition), `dueAirTime`, `dueDate`, intervalles, dernier accompli, `toleranceHours`, `toleranceMonths`, `toleranceRequiresInspection`, `toleranceAuthorized` | Chaque tâche est liée à un `aircraftId`. Initialisées depuis `maintenance/maintenance-seed.json` ou un gabarit calendrier (`fleet/firestore.ts`, `initializeAircraftMaintenanceSchedule`). |
| `maintenanceHistory` | journal d'audit (action, acteur, raison, avant/après) | Append-only (règles : update/delete interdits). |
| `maintenanceWorkOrders` | voir §3 | |
| `snags`, `snagHistory` | voir §3 | |
| Autres | `reservations` (créneau de maintenance reflété avec `source: "maintenanceWorkOrder"`), `notifications`, `operationalNotifications` | `resources` ne contient que simulateurs/locaux, pas les avions. |

**Composantes : inexistantes.** Aucun enregistrement moteur/hélice/ELT/train; tout est au niveau cellule. « Moteur », « Hélice », « ELT » ne sont que des titres de tâches (et des motifs regex dans les tables de tolérance). Pas de numéro de série, TSN/TSO, historique d'installation/dépose ni heures par composante.

**Tolérances : calendrier et heures seulement.** Fenêtre unilatérale (délai de grâce après l'échéance), pas de ± . **Cycles/atterrissages : non supportés** nulle part. Tables de tolérance approuvées codées en dur dans `maintenance/MaintenancePage.tsx` pour C152, C172 et PA31, associées par regex sur le modèle de l'avion et sur les titres de tâches — renommer une tâche fait perdre silencieusement sa tolérance. Les valeurs propres à la tâche l'emportent sur la table.

## 2. Heures de vol, compteurs et alertes

- **Alimentation** : au check-out, `scheduler/SchedulerPage.tsx` calcule `airtimeMinutes` puis `scheduler/firestore.ts` (`completeFlightAndApplyAirTime`) met à jour `airTimeTotal` de l'avion en transaction, par delta (idempotent si on recomplète le vol). Les règles laissent le personnel « horaire » écrire uniquement `airTimeTotal`, `airTimeUpdatedAt`, `lastAirTimeReservationId`.
- **Hobbs/tach** : `hobbsTotal` n'est **jamais** mis à jour par un vol (édition manuelle seulement, `fleet/ResourceManagement.tsx`) — il devient périmé. Pas de compteur tach sur l'avion; hobbs début/fin restent sur la réservation.
- **Blocage préventif** : `assertAircraftMaintenanceCompliance` (`scheduler/firestore.ts`) refuse une réservation/un vol si l'avion est bloqué, si une fenêtre de maintenance chevauche la date, ou si les heures projetées ou la date dépassent une échéance ouverte + tolérance.
- **Alertes d'échéance** : calculées à l'affichage seulement (`taskAlertClass`, `MaintenancePage.tsx`) : « bientôt » à ≤ 15 h ou ≤ 30 jours (seuils codés en dur), puis tolérance active / action requise / dépassée. Seuils **dupliqués** dans `maintenance/MaintenanceDashboard.tsx`. Les champs `warningHours`, `warningDays` (sauf un usage) et `alertLevel` existent mais ne pilotent pas les alertes.
- **Où on les voit** : uniquement sur `/maintenance`, et par les blocages au check-out. Rien sur le tableau de bord d'accueil.
- **Notifications** : `notifications` n'est écrite qu'à la création d'un SNAG et **personne ne la lit**; aucune notification d'échéance.

## 3. Bons de travail, SNAG, remise en service

- **Bons de travail** (`maintenance/MaintenanceWorkOrdersPanel.tsx`, `fleet/firestore.ts` `writeMaintenanceWorkOrder`) : source (échéance existante / SNAG / manuelle), liens `maintenanceTaskId` et `snagId`, trois assignés (PRM, DOM, technicien), 12 statuts avec table de transitions (**dupliquée** dans le panneau et dans les règles), justification obligatoire à chaque écriture, séparation des tâches (celui qui a fait le travail ne peut pas accepter l'inspection/autoriser la remise en service, sauf admin). Champ `documents` déclaré mais sans interface de dépôt.
- **Effets sur l'avion** : statuts « en cours » immobilisent l'avion (`En maintenance` + `blockedForScheduling`); l'autorisation de remise en service le remet « Disponible » (ou « SNAG » s'il reste un SNAG ouvert); le créneau du planificateur est créé/mis à jour puis conservé en historique.
- **Signature** : ni manuscrite ni NIP — « signature automatique » = uid, nom, rôle et horodatage de la session connectée. **Aucun NIP dans la maintenance.**
- **SNAG** (`fleet/FleetPage.tsx`, `fleet/SnagDashboardPage.tsx`, `/maintenance/snags`) : 4 gravités, 6 statuts; fermeture impossible à la main (uniquement via la remise en service d'un bon de travail).
- **Deux chemins de remise en service** : le bon de travail (correct) et un bouton manuel « Retour en service » sur l'avion (`MaintenancePage.tsx`, `returnAircraftToService`) qui ne demande qu'une raison saisie dans un `prompt` — **sans inspection ni signature**.
- **Absents** : carte de travail par échéance, OMA comme tierce partie, « Status Board ». Aucune occurrence dans `src/` ni `docs/`.
- **Trou majeur** : la fermeture/remise en service d'un bon de travail **ne met pas à jour la tâche** (`maintenanceTasks`) : aucun `lastCompleted…`, aucun recalcul d'échéance, aucun `completed`. Les échéances se réactualisent uniquement à la main.

## 4. Rôles, authentification et isolation

- **Rôles** (`auth/types.ts`) : Administrateur, Chef instructeur, Dispatch, Instructeur, Maintenance, Directeur de maintenance, Étudiant. « Maintenance » = PRM, « Directeur de maintenance » = DOM dans l'interface; **il n'existe pas de rôle PRM/DOM/technicien distinct**, seulement des champs d'assignation. Les permissions par module sont stockées sur `users/{uid}` et respectées telles quelles par `hasModuleAccess`.
- **Application des accès** : garde de route côté client seulement (`components/layout/AppShell.tsx`), plus quelques tests de rôle dans les panneaux de maintenance; la vraie barrière est `firestore.rules`.
- **Isolation entre organisations : aucune.** Pas d'`orgId`/tenant dans `src/` ni dans les règles; données mono-organisation. Un OMA externe ne pourrait pas être isolé du reste : avec le rôle Maintenance il lirait `aircraft`, `maintenanceTasks`, les réservations (via horaire), les SNAG et des données d'employés (`employeeAccess()`). Il faudrait un champ d'organisation sur les utilisateurs et sur chaque document, avec des règles limitées par organisation.

## 5. Règles Firestore touchant la maintenance — points trop permissifs

- **`aircraft`** : lecture ouverte à tout compte ayant `dashboard`, `schedule`, `ptr`, etc. (donc **les étudiants** aussi); écritures de `maintenanceAccess()` sans validation de champs.
- **`maintenanceTasks`** : écriture par `maintenanceAccess()` sans aucune validation (l'échéancier peut être réécrit librement).
- **`maintenanceWorkOrders`** : bonne machine d'états, mais les « qui a signé » (`workCompletedBy`, `rtsAuthorizedBy`, …) sont des champs fournis par le client, sans preuve de signature et **non immuables** après coup; le rôle Maintenance (PRM) peut autoriser la remise en service et fermer, la règle n'impose pas le DOM. Le panneau et les règles semblent en désaccord pour ce rôle **(à vérifier)**.
- **`maintenanceHistory`** : immuable (bien), mais `actorRole` n'est pas vérifié contre le vrai rôle.
- **`snags`** : lecture ouverte à `dashboard` (étudiants inclus); tout compte `fleet`/`snags` (Dispatch, Chef instructeur…) peut créer et supprimer les SNAG non liés.
- **`notifications`** : tout compte `fleet`/`snags` peut tout lire, écrire et supprimer.
- **`resources`** : écriture par tout compte `fleet` (Dispatch, Chef instructeur inclus).
- **`reservations`** : lecture ouverte aux étudiants; le marqueur `maintenanceWorkOrderId` qui protège les créneaux de maintenance est fourni par le client.

## 6. Réutilisabilité de la signature par NIP

`setPin` et `signDocument` **n'existent pas** sous ces noms. Équivalents : `PersonPinPanel.save()` (définir/changer) et `reset()` (`auth/PersonPinPanel.tsx`), POST `app/api/pin/verify/[kind]/[id]/route.ts` (vérifier, avec blocage après 5 essais / 5 min), `components/ui/PinSignaturePad.tsx` (`submit`, signer). Outils communs : `auth/pin.ts` (SHA-256 salé).

- **Réutilisable** : la mécanique (saisie, vérification serveur par jeton de l'appelant sans compte de service, blocage anti-devinette).
- **Pour un type de signataire « technicien »** : ajouter le type dans `PinSignaturePad`, `PersonPinPanel` et la table `COLLECTIONS` de la route (ex. `technicianPins`), une règle Firestore pour cette collection, un panneau « c'est bien moi » (l'identifiant possible est l'uid du compte; il n'existe pas d'entité Employé ni de `linkedEmployeeId`).
- **Limites à combler avant usage réglementaire** :
  1. Le résultat est une **phrase de texte** (« Signé électroniquement par… ») : aucune empreinte du document, aucun enregistrement signé immuable. Il faut une collection créée-seulement (`maintenanceSignatures`) liant signataire, carte de travail et empreinte du contenu.
  2. La route ne vérifie pas que l'appelant est le propriétaire du NIP; c'est voulu pour « un collègue signe au même poste », mais il faudra le resserrer pour une certification personnelle.
  3. **Le hash du NIP est lisible** par le personnel autorisé, et un NIP de 4 chiffres (10 000 combinaisons) se retrouve hors ligne en quelques secondes (aveu dans le commentaire de `auth/pin.ts`).
  4. Règle `instructorPins` : `ownInstructorPin` ne restreint que le rôle « Instructeur »; un Chef instructeur ou Administrateur peut écrire le hash de **n'importe quel** instructeur, ce qui contredit la promesse « le personnel ne définit jamais le NIP d'autrui ». Même risque à éviter pour les techniciens.
  5. Le commentaire d'en-tête de `auth/pin.ts` référence une ancienne route (obsolète).

## 7. Écarts avec le flux visé, par priorité

Flux visé : PRM école émet un bon (Status Board ou SNAG) → OMA ouvre un projet avec une carte de travail par échéance → technicien certifie avec NIP → OMA dépose le rapport → PRM école contrôle et remet en service.

**P0 — bloquants**
1. **Isolation multi-organisation** (école vs OMA) : inexistante; il faut `orgId` partout et des règles par organisation avant d'inviter un tiers.
2. **Carte de travail** par échéance (checklist, étapes, statut) et entité **projet OMA** rattachée au bon de travail : n'existent pas.
3. **Signature certifiante** : enregistrement immuable lié au contenu + NIP technicien (voir §6), à la place de la « signature automatique ».
4. **Rebouclage bon de travail → échéance** : à la clôture, mettre à jour la tâche (dernier accompli, recalcul de la prochaine échéance).

**P1 — importants**
5. Rôles distincts PRM / DOM / technicien / OMA (au lieu de champs d'assignation) et règles alignées sur l'interface.
6. Dépôt du **rapport** de l'OMA (le champ `documents` existe sans interface ni stockage).
7. **Status Board** (vue de planification des échéances à venir) — concept absent.
8. Fermer le chemin de **remise en service manuelle** sans inspection.
9. Durcir les règles : validation sur `aircraft`/`maintenanceTasks`, immuabilité des champs certifiés, retrait de la lecture étudiante des données de maintenance, correction de `notifications`/`resources`.

**P2 — utiles**
10. Composantes (moteur, hélice…) avec TSN/TSO, si l'OMA doit les suivre.
11. Cycles/atterrissages, tolérances bilatérales, et tolérances non dépendantes de regex sur les titres.
12. Alertes d'échéance configurables (`warningHours/Days`), notifications réelles, affichage sur le tableau de bord.
13. Tenir `hobbsTotal` à jour, vérifier l'annulation/modification d'un vol déjà complété **(à vérifier)**.
14. Éliminer les duplications (seuils d'alerte, table de transitions).

---

# Phase 1 — Intégration de l'OMA : décisions de modélisation

Ajout (l'audit ci-dessus n'est pas modifié). Références réglementaires citées telles que fournies dans la consigne : MCM Orizon Aviation art. 10, 17, 20, 24; MPM Orizon Maintenance Aviation art. 6.2, 10, 11, 16. Je n'ai pas relu ces textes; les justifications ci-dessous reprennent la consigne, à valider par le responsable qualité.

## D1. Organisations et isolation
- `organizations/{orgId}` (`name`, `type`: `school` | `mro`) et `organizations/{orgId}/members/{userId}` (`role`, `active`, et pour un technicien : `licenseType` ACA/SCA/AS, `licenseNumber`, `licenseClass` Atelier/Avionique/IDC/Maintenance/Structure).
- Identifiants créés : `orizon-aviation` (school) et `orizon-maintenance` (mro). Le modèle est générique (plusieurs écoles/OMA possibles).
- `orgId` ajouté **uniquement** à : `aircraft`, `snags`, `reservations`, `notifications`, `instructorPins`, `workOrders`, `projects`, `workCards`, `organizations`, `members`. Aucune autre collection n'est touchée (dont `maintenanceTasks`, `maintenanceHistory`, `snagHistory`, étudiants, PTR, employés).
- Choix de modélisation (sans impact réglementaire) : l'appartenance est **autoritaire dans `members`** (les règles y lisent), et copiée sur `users/{uid}` (`orgIds`, `schoolOrgId`, `mroOrgId`) uniquement pour que le client sache quel `orgId` filtrer sans requête supplémentaire. Ce champ n'est jamais utilisé par les règles.
- Une règle Firestore ne filtre pas : toute requête de liste sur une collection à `orgId` doit contenir `where("orgId","==",…)`.

## D2. Migration (pas de règle de transition)
- Outil administrateur ponctuel (Administration → Paramètres), avec **simulation** puis exécution et **rapport par collection** (analysés / déjà étiquetés / à étiqueter / étiquetés / erreurs). Aucun script Node : il n'existe pas de compte de service, donc l'outil s'exécute dans la session de l'administrateur.
- Tous les documents sans `orgId` reçoivent `orizon-aviation`. Aucun document existant n'est identifiable comme appartenant à l'OMA (aucune trace d'OMA dans les données actuelles); un document déjà étiqueté est laissé tel quel (l'outil est idempotent).
- Crée aussi les deux organisations, une fiche `members` par utilisateur existant (dans `orizon-aviation`) et les champs de commodité de `users`.
- **Ordre de déploiement obligatoire** (rien n'est déployé par cette phase tant que tu ne l'approuves pas) : (1) client « étape A » (écritures avec `orgId` + outil de migration, règles actuelles inchangées); (2) exécuter la migration jusqu'à zéro « à étiqueter »; (3) client « étape B » (requêtes filtrées par `orgId`) puis règles strictes. Après l'étape 3, **aucune règle n'accepte un document sans `orgId`**.

## D3. Bon de travail, projet, carte de travail
- `workOrders/{id}` : `orgId` = organisation émettrice (école), `sharedWithOrgId` = OMA destinataire. Statuts : `brouillon → transmis → pris_en_charge → rapport_depose → controle_prm → cloture`.
- `projects/{workOrderId}` : **même identifiant que le bon** (relation 1:1), pour que les règles puissent le lire sans requête. Porte `orgId` (OMA), `cardCount`, `openCardCount`, `signerUids` (croissant seulement).
- `workCards/{id}` : `projectId`, `orgId` (OMA), `ata`, `subject`, `type` (routine/snag), `assignedUserId`, `status` (ouvert/ferme), `requiredClass` (optionnel), `rectification`, `parts[]` (n° de pièce, S/N retiré, S/N installé, quantité), `maintenanceTaskId` (optionnel, échéance visée), `nextDue` (calculé à la fermeture).
- Les compteurs `cardCount/openCardCount/signerUids` sont dénormalisés parce que les règles ne peuvent ni compter ni interroger; ils sont modifiés dans le même commit atomique que la carte et validés par les règles (`getAfter`).
- **Rebouclage des échéances** (choix confirmé) : à la fermeture, la prochaine échéance est **calculée et stockée sur la carte** (`nextDue`), sans écriture dans les données de l'école. Le PRM de l'école les **applique aux `maintenanceTasks` lors de la remise en service** (`cloture`). Justification : l'isolation interdit à l'OMA d'écrire chez l'école, et l'échéance ne doit avancer qu'après le contrôle du PRM.
- **Contrôle** : la remise en service (`controle_prm → cloture`) est refusée par les règles tant que `openCardCount > 0`. Je n'ai pas imposé cette condition à la transition `pris_en_charge → rapport_depose` (la consigne ne l'exige qu'au contrôle).

## D4. Séparation des tâches — technicien ≠ contrôleur PRM (bloquant)
- Une même personne (`userId`) ne peut pas signer une carte comme technicien **et** faire la transition `rapport_depose → controle_prm` du bon parent du même projet. Implémenté en règle Firestore : chaque signature ajoute le `uid` à `projects/{id}.signerUids` (croissant seulement, vérifié à la création de la signature), et la transition est refusée si `request.auth.uid ∈ signerUids`.
- Justification (selon la consigne, MCM art. 20, MPM art. 11) : indépendance entre l'exécution du travail et le contrôle.
- **Aucune exception administrateur** dans cette règle (contrairement à l'ancien flux des `maintenanceWorkOrders`), car la consigne parle d'une règle bloquante sans exception.
- **RISQUE À TRAITER AVANT LA MISE EN PRODUCTION** : si une seule personne qualifiée existe pour un projet et qu'elle signe une carte, personne d'autre ne peut faire le contrôle et le projet reste bloqué. Je n'ai pas accès à l'effectif réel de l'OMA. L'outil de migration/diagnostic inclut un contrôle de l'effectif (nombre de membres distincts pouvant tenir le rôle PRM dans chaque organisation, avertissement s'il est inférieur à 2). À décider : contrôleur suppléant désigné, ou dérogation encadrée.

## D5. Classe du technicien vs carte — choix délibéré de ne pas bloquer
- La signature n'est **pas** refusée si la classe du technicien ne correspond pas à `requiredClass`. La signature enregistre `requiredClass`, `technicianClass` et `classMatch` (`match` / `mismatch` / `unspecified`), visibles dans l'historique de la carte.
- Raison : éviter de bloquer le flux pendant que la correspondance ATA → classe se stabilise. **Un passage à un blocage dur est prévu** dès que les données de correspondance seront fiables.

## D6. Signature certifiante par NIP
- Réutilise `PersonPinPanel`, `/api/pin/verify` (blocage 5 essais / 5 min) et `PinSignaturePad`; nouveau type de signataire `technician` (collection `technicianPins`, écriture par soi-même seulement).
- NIP haché avec sel et **PBKDF2** (versionné : les NIP existants en SHA-256 salé restent vérifiables), 5 essais puis verrouillage.
- La signature crée un enregistrement **immuable** `workCards/{id}/signatures/{sigId}` (création seulement) contenant le hash SHA-256 du contenu de la carte au moment de la signature, calculé par la route serveur à partir de la carte lue dans Firestore (pas fourni par le client), le numéro ACA/SCA/AS et la classe copiés à l'instant de la signature, et le résultat de correspondance de classe.
- Une carte signée est en lecture seule (règles). Toute correction ultérieure crée une **nouvelle inscription** dans `workCards/{id}/entries/{entryId}` (création seulement); l'ancienne n'est jamais effacée.
- **Limite honnête** : il n'existe pas de secret côté serveur (pas de compte de service). Les règles garantissent l'immuabilité et l'atomicité carte + signature, mais un utilisateur autorisé qui contournerait la route pourrait écrire une valeur de hash arbitraire; le hash permet de **détecter** une modification a posteriori (recalcul du contenu) et non de prouver cryptographiquement l'auteur. Un sceau serveur (secret dans les variables d'environnement Vercel) est la suite naturelle si l'OMA exige une preuve d'intégrité opposable.

## D7. Règles corrigées dans la même passe (issues de l'audit)
- `notifications` : plus d'accès total; création validée, lecture limitée, suppression réservée à la maintenance/administration.
- `aircraft`, `snags`, `reservations` : plus lisibles par les étudiants (un étudiant ne lit que ses propres réservations).
- `instructorPins` : le hash ne peut être écrit que par l'instructeur lui-même (lié à sa fiche); un responsable peut seulement **réinitialiser** (supprimer).
- Toutes ces règles exigent l'appartenance à l'organisation du document.

## D8. Limites de validation
- Java n'était pas installé au moment d'écrire ceci : **l'émulateur Firestore n'avait pas pu être lancé**, donc les règles étaient vérifiées par compilation (`firebase deploy --dry-run`) et relecture, **pas par tests d'exécution**. Une liste de tests manuels à passer sur le projet de test est fournie plus bas.
- **Mise à jour (voir « Tests d'émulateur » après D10)** : Java a depuis été installé et des tests d'émulateur automatisés existent (`tests/firestore-rules/`, 37/37 passent). La liste de tests manuels ci-dessous reste utile en validation finale sur le projet de test réel, mais n'est plus la seule preuve de comportement pour le flux OMA et l'isolation par organisation.

## D9. Corrections et précisions (fin de phase 1)
- **D2 — ordre de déploiement (remplace la formulation ci-dessus)** : (1) un seul déploiement client (écritures avec `orgId`, outil de migration, module OMA). Tant qu'un utilisateur n'a pas `schoolOrgId`, `schoolScope()` renvoie `[]` et `withSchoolOrg()` ne fait rien : le client se comporte comme avant. (2) Avec les règles « étape A » (`firestore.rules`, clause transitoire `orgStamp()` réservée à l'administrateur), exécuter l'outil en **simulation**, puis en exécution; vérifier « restant à étiqueter = 0 » pour les 5 collections. (3) Seulement ensuite : `cp firestore.rules.stage-b firestore.rules` puis déploiement des règles, **sur approbation explicite**. L'étape B retire `orgStamp()` : plus aucune règle n'accepte un document sans `orgId`, aucun défaut implicite.
- **Rôle global `OMA`** : permissions `["oma"]` seulement. Un utilisateur OMA n'a donc aucune permission scolaire. Création : inviter avec le rôle « OMA », puis l'ajouter à l'organisation `orizon-maintenance` (Administration → Organisations) avec type/n° de licence et classe.
- **Exposition résiduelle (hors périmètre demandé)** : les collections non listées en D1 (`maintenanceTasks`, `maintenanceHistory`, `employees`, `instructors`, `students`, etc.) restent contrôlées par rôle uniquement, sans `orgId`. Une seconde école ou un second OMA verrait ces données si son rôle global le permet. À traiter en phase suivante.
- **Séparation des tâches (mise à jour en D10)** : à l'origine, la règle ne couvrait que `rapport_depose → controle_prm`, pas `controle_prm → cloture`. **D10 étend la garde aux deux transitions** : voir D10 pour le détail. Aucune exception administrateur. Risque d'impasse et de dotation : voir D4. L'outil de migration signale un avertissement si l'OMA compte moins de 2 membres aptes au rôle PRM.
- **Étudiants** (règles étape B) : plus de lecture de `aircraft` ni `snags`; réservations : seulement les leurs. L'Horaire étudiant n'abonne plus les avions/SNAG et n'affiche que ses vols. Le `students` collectif lu par l'Horaire reste refusé aux étudiants (règle antérieure `ownPtr`, inchangée). `scheduleAccess()` donne encore l'écriture sur `reservations` aux étudiants (trou **antérieur**, non modifié dans cette phase).
- **Index composites** : aucune requête ajoutée ne combine `orgId` avec un intervalle ou un tri. Deux requêtes `array-contains` (`participantStudentIds`) + `orgId ==` sont à vérifier à l'exécution (le message d'erreur Firestore fournit le lien de création d'index le cas échéant).
- **`replaceFleet`** utilise des identifiants d'avion fixes (`c-gabc`, …) : collision possible entre organisations si une seconde école l'utilise.
- **Tests manuels des règles à faire sur le projet de TEST avant la production** (l'émulateur est indisponible) : (a) étudiant ne lit pas `aircraft`/`snags`/réservations d'autrui; (b) utilisateur d'une autre organisation ne lit rien; (c) OMA ne lit pas `aircraft` de l'école mais lit le bon partagé; (d) transition `rapport_depose → controle_prm` refusée au technicien signataire; (e) `controle_prm → cloture` refusée si `openCardCount > 0`; (f) carte signée non modifiable, signature non modifiable/supprimable; (g) `notifications` refusées hors organisation; (h) NIP : 5 essais puis blocage; (i) écriture du hash `instructorPins` refusée à un tiers; (j) un technicien ayant signé une carte du projet tente `controle_prm → cloture` et doit être **refusé**; (k) un autre membre PRM (n'ayant signé aucune carte du projet) exécute `controle_prm → cloture` et doit être **accepté**.
- **Dette explicite à traiter avant l'ajout d'une deuxième école ou d'un deuxième OMA** : `maintenanceTasks`, `maintenanceHistory`, `employees`, `instructors`, `students` (et les autres collections non listées en D1) ne portent pas `orgId` et ne sont isolées que par rôle global. Un second établissement ou une seconde OMA ayant un rôle scolaire verrait ces données. Voir aussi le contournement résiduel documenté en D10 (écriture directe de `aircraft`/`maintenanceTasks` hors du flux OMA).
- Limite : les règles ne sont validées que par compilation (`--dry-run`) et relecture; aucun test comportemental n'a été exécuté. Vérification de type (`tsc`) OK; aucun test d'exécution du client ou des routes.

## D10. Séparation des tâches étendue à controle_prm → cloture
- Même garde que D4, appliquée en plus à la transition `controle_prm → cloture` dans `firestore.rules` **et** `firestore.rules.stage-b` : un `userId` présent dans `projects/{id}.signerUids` (donc ayant signé au moins une carte du projet comme technicien) ne peut exécuter ni `rapport_depose → controle_prm` ni `controle_prm → cloture`.
- **Justification** : sans cette extension, un technicien signataire ne pouvait pas démarrer le contrôle, mais rien n'empêchait qu'il exécute quand même la remise en service finale si un autre PRM avait démarré le contrôle — le double contrôle technicien/PRM aurait disparu à la toute dernière étape, celle qui remet réellement l'avion en service.
- **Vérification de contournement par une autre écriture** : `closeWorkOrderAndReturnToService` (`features/oma/firestore.ts`) exécute un **seul `writeBatch`** contenant la transition `workOrders.status → cloture`, les mises à jour de `maintenanceTasks` (prochaine échéance) et la libération de `aircraft`. Un batch Firestore est validé document par document mais commité de façon atomique : si l'écriture sur `workOrders` est refusée par la règle de séparation, **tout le batch échoue**, donc les échéances et l'avion ne sont pas non plus modifiés par ce chemin. Ce chemin ne peut pas être contourné.
- **Contournement résiduel identifié (préexistant, hors périmètre de cette règle)** : les règles de `aircraft` et `maintenanceTasks` autorisent toute personne ayant `maintenanceAccess()` (rôle Maintenance/DOM/Admin) à les modifier **directement**, sans passer par le flux OMA ni par la transition `workOrders`. Un PRM bloqué par la séparation des tâches (parce qu'il a signé une carte) pourrait donc, via les pages Flotte/Maintenance existantes, remettre l'avion « Disponible » à la main et modifier une échéance directement, sans jamais toucher `workOrders.status` — contournant de fait l'esprit de la règle, mais pas la règle elle-même (qui ne porte que sur le bon de travail). C'était déjà vrai avant la phase 1 (audit §5, points 1 et 2) et reste hors du périmètre demandé (« orgId uniquement sur les collections listées »); le corriger impliquerait de restreindre l'écriture directe de `aircraft`/`maintenanceTasks` quand un bon de travail OMA est en cours, ce que je n'ai pas fait sans confirmation.
- **Transitions couvertes par la séparation** : `rapport_depose → controle_prm` et `controle_prm → cloture`. Les autres transitions (`brouillon → transmis`, `transmis → pris_en_charge`, `pris_en_charge → rapport_depose`) ne sont pas concernées : elles sont côté école (émission) ou côté OMA (prise en charge, dépôt du rapport), pas des étapes de contrôle.
- **Limite levée depuis** : au moment d'écrire ceci, l'émulateur Firestore n'avait pas pu être lancé (Java absent). Java a depuis été installé (`brew install openjdk`, sans sudo) et les deux transitions sont maintenant couvertes par des tests d'émulateur automatisés (`tests/firestore-rules/oma-workflow.spec.ts`, cas (c)/(d), 37/37 tests passent — voir plus bas « Tests d'émulateur » pour le détail complet). Les tests manuels (j)/(k) ci-dessous restent utiles en validation finale sur le projet de test, mais ne sont plus la seule preuve de comportement.
- **Contrôleur et clôtureur : décision du propriétaire (n'est plus une question ouverte)** : la consigne demandait de vérifier si le rôle du contrôleur (`controle_prm`) et celui de la clôture (`cloture`) doivent être des **personnes distinctes** l'une de l'autre, au-delà de « ni l'une ni l'autre ne doit être un technicien signataire ». Le propriétaire du produit a tranché : **cette séparation n'est pas imposée**. Le même PRM peut démarrer le contrôle et clôturer; la seule séparation obligatoire reste technicien signataire ≠ contrôleur/clôtureur du même projet (D4, étendue ci-dessus). Testé explicitement : `oma-workflow.spec.ts`, cas (d) « même personne, rôles différents ».

## Tests d'émulateur (`tests/firestore-rules/`)
Java installé localement (`brew install openjdk`, aucune commande système n'a demandé d'approbation — pas de `sudo` nécessaire, l'ajout au `PATH` suffit). Émulateur configuré dans `firebase.json` (`emulators.firestore.port: 8080`). Suite écrite avec `@firebase/rules-unit-testing@4.0.1` (dernière version compatible avec `firebase@^11`, déjà utilisé par le projet — les versions 5.x exigent `firebase@^12`) et `vitest`. Lancement : `npm run test:rules` (encapsule `firebase emulators:exec --only firestore "vitest run"`, aucune approbation manuelle requise une fois l'émulateur démarré).

**Résultat : 37/37 tests passent**, contre les deux fichiers de règles (`firestore.rules` et `firestore.rules.stage-b`) :
- `oma-workflow.spec.ts` (exécuté une fois par étape de règles, ces règles étant identiques entre les deux fichiers) : isolation par organisation sur `organizations/members`, `workOrders`, `projects`/`workCards`, `technicianPins`; l'OMA destinataire ne peut modifier que le statut/rapport d'un bon, jamais les champs de l'école; séparation des tâches sur les deux transitions de contrôle (technicien signataire refusé, autre PRM accepté, **aucune exception administrateur** même pour un utilisateur admin dans les deux organisations); même personne non-signataire acceptée pour contrôler PUIS clôturer; signature immuable (update/delete refusés) et carte signée non modifiable; une signature légitime **peut** être créée (carte + signature + projet dans un seul `writeBatch`, sans contourner les règles).
- `stageB.spec.ts` : isolation par organisation sur `aircraft`, `snags`, `reservations`, `notifications`, `instructorPins` (un document sans `orgId` est refusé); étudiant refusé sur `aircraft`/`snags`/réservations d'autrui, accepté sur sa propre réservation; un chef instructeur ou administrateur non lié ne peut pas écrire le hash d'un autre instructeur; `technicianPins` exige une organisation de type `mro`.
- `stageA-orgStamp.spec.ts` : un administrateur peut poser `orgId` une seule fois sur un document qui n'en a pas (`instructorPins`), ne peut plus le changer ensuite, et ne peut pas combiner ce marquage avec la modification d'un autre champ.

**Aucune règle n'a dû être corrigée.** Les deux échecs initiaux (avant la version finale des tests) venaient d'un rôle d'organisation mal choisi dans le scénario de test (un « technicien » au lieu d'un « PRM » côté OMA pour accepter un bon) — corrigé dans le test, pas dans les règles.

**Ce qui reste non couvert par l'émulateur** : les collections hors périmètre de cette phase (`maintenanceTasks`, `employees`, `instructors`, `students`, etc., D9), le flux complet bout-en-bout via l'interface (ces tests appellent directement le SDK Firestore, pas les routes Next.js ni l'UI), et la route serveur `/api/oma/sign-card` (qui utilise l'API REST Firestore avec le jeton de l'appelant, pas testée ici). La liste de tests manuels de D9 reste donc utile pour une validation de bout en bout sur le projet de test réel.

## Outil de sauvegarde/restauration (`scripts/backup-migration-data.mjs`)
Export en lecture seule, en JSON local, des collections concernées par la migration des organisations : `organizations` (+ sous-collection `members` de chaque organisation), `users` (champs `orgIds`/`schoolOrgId`/`mroOrgId`) et **quatre** des cinq collections étiquetées : `aircraft`, `snags`, `reservations`, `notifications`.

- **`instructorPins` volontairement exclu de ce script** : ce sont des empreintes de NIP, elles ne doivent pas se retrouver dans un fichier JSON local. Cette collection est couverte uniquement par l'export géré Google Cloud (D12, étape 1 — `gcloud firestore export`/`import`), qui restaure de façon fidèle sans passer par les règles Firestore. Le script consigne cette exclusion dans `manifest.json` (`excluded: { instructorPins: "…" }`) et l'affiche à l'écran au démarrage de chaque export.
- **Authentification (décision du propriétaire)** : aucun compte de service, ni compte dédié, n'a été créé pour ce script — il s'exécute avec le **compte Administrateur du propriétaire** sur le projet de test. Les identifiants (courriel + mot de passe) sont **saisis de façon interactive** (mot de passe masqué), ou fournis par les variables d'environnement `BACKUP_ACCOUNT_EMAIL`/`BACKUP_ACCOUNT_PASSWORD` réglées dans le terminal de l'opérateur — jamais demandés dans le chat, jamais écrits dans un fichier de ce dépôt. Note de conception (voir aussi D9) : avec les règles actuelles, aucun rôle moins privilégié qu'Administrateur ne peut lire `users` (liste complète) ni les sous-collections `organizations/*/members` d'organisations dont le compte n'est pas membre — il n'existe donc pas de rôle « lecture seule » suffisant pour ce script, quel que soit le compte utilisé.
- **Usage** : `node --env-file=.env.local scripts/backup-migration-data.mjs` (ou `npm run backup:migration-data`), qui lit les mêmes variables `NEXT_PUBLIC_FIREBASE_*` que l'application. Affiche `NEXT_PUBLIC_FIREBASE_PROJECT_ID` en premier, avant toute connexion; refuse de s'exécuter si `projectId` ne contient pas `test`/`staging`/`sandbox`/`demo` (même garde que `src/services/firebase/client.ts`).
- **Échec par collection** : chaque collection (et chaque sous-collection `organizations/{orgId}/members`) est lue indépendamment; un refus des règles Firestore sur l'une d'elles est consigné clairement (nom de la collection + `permission-denied`) et **n'interrompt pas** l'export des autres. Le code de sortie du processus est non nul si au moins une collection a échoué, pour qu'un script appelant puisse le détecter.
- **Sortie** : `backups/migration/<horodatage>/`, un fichier JSON par collection plus `organizations-members/<orgId>.json` et un `manifest.json` récapitulatif (dont les échecs et l'exclusion volontaire d'`instructorPins`). Le dossier `backups/` est ajouté à `.gitignore` (vérifié : un dossier de test créé sous `backups/migration/` n'apparaît jamais dans `git status --short`, y compris en cas d'erreur d'utilisation de `git add`) — ces données réelles (élèves, employés) **ne doivent jamais être committées**.
- **Sérialisation** : les champs `Timestamp` Firestore sont conservés sous forme `{ "__type": "timestamp", "iso": "…" }` plutôt qu'aplatis en chaîne, pour permettre une restauration fidèle du type.
- **Restauration** : `node --env-file=.env.local scripts/backup-migration-data.mjs -- --restore <dossier>` (confirmation explicite requise : taper `RESTAURER`). Réécrit chaque document (`setDoc`, donc remplace intégralement) avec son identifiant d'origine, en reconstruisant les `Timestamp`, pour les collections présentes dans le dossier (donc jamais `instructorPins`, plus exporté par ce script). Un document refusé par les règles est compté séparément dans un rapport (`restore-report-<horodatage>.json`) plutôt que de faire échouer silencieusement le reste. Pour une restauration complète et fidèle (y compris `instructorPins`), voir l'import de l'export géré Google Cloud (D12, étape 6, option 1).
- Non testé en conditions réelles (contre le projet de test) dans le cadre de cette tâche : seule la syntaxe (`node --check`) et le comportement de garde (variables d'environnement manquantes, refus hors projet de test) ont été vérifiés. À valider une première fois en conditions réelles avant de s'y fier pour un incident réel.

## Migration en exécution : depuis quel outil
La migration (simulation et exécution, D2) se lance **uniquement depuis le panneau Administration → Organisations** de l'application (bouton « Simuler »/« Exécuter »), pas depuis un script ni la ligne de commande — il n'existe pas de compte de service pour l'exécuter autrement (D8). Elle s'exécute donc avec le compte de la **personne connectée** dans l'interface au moment du clic (nécessairement un compte `Administrateur`, seul rôle autorisé par les règles à écrire `organizations`, les fiches `members` et à poser `orgId` via `orgStamp()` sur `snags`/`notifications`/`instructorPins` — voir D1/D2). C'est volontairement un geste humain, distinct de la sauvegarde en lecture seule ci-dessus, même si les deux utilisent aujourd'hui le même compte Administrateur du propriétaire (aucun compte séparé créé pour l'un ou l'autre, décision du propriétaire).

## D11. Proposition (non implémentée) — fermer le contournement résiduel de D10
Fermerait le contournement décrit en D10 : écritures directes sur `aircraft` (statut) et `maintenanceTasks` (échéances) sans passer par `workOrders`. **Non codé** — à valider avant implémentation, notamment l'impact sur le bouton de remise en service manuelle et sur les pages Flotte/Maintenance existantes.

- **Piste retenue** : conditionner, dans les règles, toute écriture de `aircraft.status`/`blockedForScheduling` vers un état « en service » (et toute écriture sur `maintenanceTasks` touchant `dueAirTime`/`dueDate`/`lastCompletedAirTime`/`lastCompletedDate`) à l'existence d'un `workOrders` lié dont la transition `controle_prm → cloture` vient de réussir **dans le même batch**, en utilisant `getAfter()`/`existsAfter()` comme le fait déjà D10 pour `signerUids` :
  ```
  // Idée, non testée : sur aircraft, en plus de maintenanceAccess() :
  request.resource.data.status != resource.data.status  // changement de statut
    ? existsAfter(/databases/$(database)/documents/workOrders/$(request.resource.data.lastWorkOrderId))
      && getAfter(/databases/$(database)/documents/workOrders/$(request.resource.data.lastWorkOrderId)).data.status == 'cloture'
      && getAfter(...).data.aircraftId == id
    : true
  ```
  Cela suppose un champ `lastWorkOrderId` sur `aircraft` que `closeWorkOrderAndReturnToService` fournirait déjà à l'écriture (actuellement absent : à ajouter). Même idée pour `maintenanceTasks`, avec un champ reliant chaque tâche modifiée au bon de travail qui la clôture — plus complexe ici, puisqu'une seule clôture peut toucher plusieurs tâches (une par carte), alors que `getAfter()` ne vérifie qu'un document à la fois : il faudrait soit une règle par tâche portant son propre `lastWorkOrderId`, soit accepter que la garde ne couvre que `aircraft` dans un premier temps.
- **Ce que ça changerait pour le bouton de remise en service manuelle** (`MaintenancePage.tsx`, `returnAircraftToService`, audit §3) : cette voie deviendrait **bloquée dès qu'un bon de travail OMA a été émis pour cet avion** (elle resterait ouverte pour un avion qui n'a jamais eu de bon OMA, donc pour les écoles qui n'utilisent pas encore le module OMA). C'est probablement l'effet recherché — l'audit qualifiait déjà ce bouton de trou (remise en service « sans inspection ni signature ») — mais c'est un changement de comportement pour l'utilisateur final, à confirmer.
- **Ce que ça changerait pour les pages Flotte/Maintenance** : la modification directe du statut d'un avion ou d'une échéance resterait possible **tant qu'aucun bon OMA n'est en cours**, mais serait bloquée pendant qu'un bon est `transmis`/`pris_en_charge`/`rapport_depose`/`controle_prm`, et seule la clôture du bon débloquerait le prochain changement de statut « en service ». Cela pourrait gêner des corrections manuelles légitimes (erreur de saisie, avion remis en service pour une autre raison sans lien avec l'OMA) : il faudrait probablement une échappatoire administrateur explicite et journalisée, à l'opposé du choix fait pour la séparation des tâches (D4 : aucune exception admin) — un point à trancher avec le propriétaire, pas à décider seul.
- **Limite** : cette piste n'a pas été codée, ni testée à l'émulateur ni en compilation. Elle est proposée comme direction, pas comme solution prête à déployer.

## D12. Plan de déploiement sur le projet de test (aucune commande exécutée)
Séquence complète, de l'export géré jusqu'à la bascule stage-b. **Rien de cette section n'a été exécuté** : chaque commande de déploiement ou d'écriture reste soumise à une approbation explicite, étape par étape. Projet cible dans tous les exemples : `orizon-flight-director-test`.

**Constat préalable (lecture seule, vérifié)** : PITR (Point-in-Time Recovery) est **désactivé** sur ce projet (`firebase firestore:databases:get "(default)" --project orizon-flight-director-test` → `Point In Time Recovery: POINT_IN_TIME_RECOVERY_DISABLED`), et la protection contre la suppression est aussi désactivée. La fenêtre de rétention des versions de documents est de 3600 s (1 h) seulement. Conséquence : pas de filet de sécurité géré par Google au-delà d'une heure — l'export géré (étape 1) est la seule protection réelle et **fidèle** (y compris `instructorPins`) pour cette migration.

### Étape 1 — Export géré Google Cloud (avant tout déploiement, fait par le propriétaire du projet)
- Fait manuellement par le propriétaire via la console Google Cloud (base complète, bucket dédié) — pas par moi, pas par ce dépôt. Commande équivalente en CLI, donnée pour référence, **non exécutée** :
  ```
  gcloud firestore export gs://<BUCKET_DEDIE>/firestore-backups/$(date +%Y%m%d-%H%M%S) \
    --project=orizon-flight-director-test
  ```
  (base complète, sans `--collection-ids`, pour permettre une restauration totale y compris `instructorPins` — voir retour arrière de l'étape 6.)
- Observer : l'export apparaît « Terminé » dans la console Google Cloud (Firestore → Sauvegardes/Exports), avec le chemin `gs://…` du résultat. **Aucune étape suivante ne démarre avant confirmation explicite que cet export est terminé.**
- Retour arrière : sans objet (lecture seule).

### Étape 2 — Sauvegarde JSON ciblée (complémentaire, lisible, après confirmation de l'étape 1)
- Commande : `node --env-file=.env.local scripts/backup-migration-data.mjs` (ou `npm run backup:migration-data`), lancée avec le **compte Administrateur de test du propriétaire** (aucun compte dédié créé — décision du propriétaire; voir « Outil de sauvegarde/restauration » plus haut pour la justification : aucun rôle moins privilégié ne peut lire toutes les collections concernées de toute façon). Avant de lancer : afficher et faire confirmer `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (le script l'affiche lui-même en premier, avant toute connexion) — **arrêt immédiat si ce n'est pas `orizon-flight-director-test`**. Les identifiants sont saisis à l'invite (masqués) ou fournis par `BACKUP_ACCOUNT_EMAIL`/`BACKUP_ACCOUNT_PASSWORD` dans le terminal de l'opérateur — jamais demandés dans le chat, jamais écrits dans un fichier.
- Observer : un dossier `backups/migration/<horodatage>/` apparaît, avec un fichier par collection (`organizations.json`, `users.json`, `aircraft.json`, `snags.json`, `reservations.json`, `notifications.json` — **pas** `instructorPins.json`, exclu volontairement), `organizations-members/*.json` et `manifest.json` (qui liste aussi l'exclusion et tout échec par collection). Confirmer que ce dossier n'est **pas** suivi par git (`git status --short` ne doit rien afficher pour `backups/`). Compter le nombre de documents par collection dans `manifest.json`.
- Rôle de cette sauvegarde : un filet secondaire, lisible sans outil Google Cloud, pour une inspection rapide ou une restauration partielle immédiate des collections qu'elle couvre. `instructorPins` n'en fait jamais partie : sa seule sauvegarde/restauration fidèle passe par l'import de l'étape 1 (`gcloud firestore import`).
- Retour arrière : sans objet (lecture seule).

### Étape 3 — Règles étape A (`firestore.rules`, avec `orgStamp()`)
- Commande : `firebase deploy --only firestore:rules --project orizon-flight-director-test`
- Observer : déploiement réussi (URL de la console affichée); dans la console Firebase → Firestore → Règles, la nouvelle version apparaît horodatée. Spot-check : connexion, Horaire, Étudiants, PTR fonctionnent normalement pour un compte existant (aucune régression attendue : l'étape A n'ajoute que des clauses `||` supplémentaires ou de nouvelles collections, elle ne restreint rien de ce qui existe déjà).
- Retour arrière : redéployer `firestore.rules` étape A. Deux façons équivalentes : (i) Console Firebase → Firestore → Règles → onglet historique des versions → sélectionner la version précédente → « Publier »; (ii) `git show ac14687:firestore.rules > /tmp/rollback.rules` (dernier commit avant la phase 1) puis `firebase deploy --only firestore:rules --project orizon-flight-director-test` avec ce fichier. Sans risque de perte de données : une règle n'efface rien, elle ne fait qu'autoriser ou refuser des écritures futures.

### Étape 4 — Client (Vercel, projet déjà lié, environnement de test)
- **Contrôle préalable obligatoire** : avant `vercel --prod`, vérifier dans le tableau de bord Vercel (Project Settings → Environment Variables) que les variables `NEXT_PUBLIC_FIREBASE_PROJECT_ID` valent bien `orizon-flight-director-test` et que `NEXT_PUBLIC_APP_ENV=test` pour l'environnement ciblé. Ce n'est pas qu'une précaution documentaire : `src/services/firebase/client.ts` fait déjà ce contrôle **au runtime** et lève une exception si `NEXT_PUBLIC_APP_ENV==="test"` et que `projectId` ne contient ni `test`, ni `staging`, ni `sandbox`, ni `demo` — donc un déploiement mal configuré planterait au chargement plutôt que d'écrire silencieusement sur le mauvais projet. Le contrôle manuel reste utile pour l'éviter *avant* de déployer, pas seulement le détecter après.
- Commande : `vercel --prod` (jamais de nouveau lien de projet), puis `vercel ls` et `vercel remove <url superseded> --safe --yes`.
- Observer : l'application se comporte comme avant pour tout compte sans organisation (`schoolScope()`/`withSchoolOrg()` sont des no-op); un compte Administrateur voit le panneau « Organisations » sous Administration; le lien « OMA » apparaît dans la navigation pour Administrateur/Maintenance/Directeur de maintenance/OMA.
- Retour arrière : `vercel rollback <url du déploiement précédent>` (Vercel conserve l'historique des déploiements).

### Étape 5 — Migration : simulation
- Action : Administration → Organisations → bouton « Simuler » (aucune commande CLI; l'outil tourne dans la session du navigateur de l'administrateur, faute de compte de service).
- Observer : le rapport affiché indique `organizations.toCreate = [orizon-aviation, orizon-maintenance]`, `members.missingUserIds` listant nommément les utilisateurs qui recevraient une fiche « membre » (pas seulement un compte), et pour chacune des 5 collections étiquetées un compte `toTag`. **Aucune écriture n'a lieu** à cette étape (vérifiable : `remainingToTag` du rapport = somme des `toTag`, et aucun nouveau document `organizations/*` n'existe encore dans la console).
- Retour arrière : sans objet (lecture seule).

### Étape 6 — Migration : exécution
- Action : même panneau, bouton « Exécuter ».
- Observer : le rapport affiche `tagged` égal à `toTag` pour chacune des 5 collections, `remainingToTag = 0`, `members.created` égal à `members.toCreate`, **`members.missingUserIds` vide** (le panneau l'affiche explicitement, en rouge, avec la liste des identifiants s'il en reste), `users.updated` égal à `users.toUpdate`, et **aucune erreur** dans les tableaux `errors`. Le diagnostic d'effectif (`staffing`) signale presque certainement `orizon-maintenance` avec 0 membre (« Aucun membre enregistré dans l'OMA ») : c'est attendu, aucun utilisateur existant n'est actuellement un technicien OMA.
- **Ne pas continuer si `remainingToTag > 0`, si `members.missingUserIds` n'est pas vide, ou si des `errors` apparaissent** : relancer l'exécution (l'outil est idempotent — un document ou une fiche déjà créés sont laissés tels quels) après avoir examiné les identifiants en cause individuellement.
- Retour arrière (deux options, du plus complet au plus rapide) :
  1. **Import de l'export géré de l'étape 1** (complet et fidèle, y compris `instructorPins`, car il passe par l'API d'administration Google Cloud avec des permissions IAM, pas par les règles Firestore) :
     ```
     gcloud firestore import gs://<BUCKET_DEDIE>/firestore-backups/<horodatage-étape-1> --project=orizon-flight-director-test
     ```
     Non exécuté ici — à faire par le propriétaire, comme l'export. C'est le retour arrière **de référence** pour cette étape.
  2. Restauration partielle depuis la sauvegarde JSON de l'étape 2 : `node --env-file=.env.local scripts/backup-migration-data.mjs --restore backups/migration/<horodatage>` (confirmation `RESTAURER` requise). **Limite** : `instructorPins` n'est **jamais** exporté par ce script (exclusion volontaire, voir plus haut) et ne sera donc **pas** restauré par ce chemin, quel que soit le compte utilisé; le rapport de restauration liste séparément tout autre document qu'un compte Administrateur ne peut pas réécrire selon les règles. À réserver aux cas où l'import géré (option 1) n'est pas disponible ou trop lent à relancer.

### Étape 7 — Compléter l'effectif de l'OMA
- Action : Administration → Organisations → ajouter un membre à `orizon-maintenance`, rôle `prm` ou `admin`, pour **au moins deux personnes distinctes** (pas seulement une, à cause du risque d'impasse documenté en D4 : si une seule personne qualifiée signe une carte, plus personne ne peut faire le contrôle).
- Observer : en relançant une simulation de migration (étape 5, sans réexécuter), le diagnostic `staffing` pour `orizon-maintenance` ne signale plus l'avertissement d'effectif insuffisant.
- Retour arrière : supprimer la fiche `organizations/orizon-maintenance/members/{uid}` ajoutée par erreur (bouton de suppression du panneau, ou console Firebase).

### Étape 8 — Bascule vers les règles strictes (`firestore.rules.stage-b`)
- **Pré-requis impératif, vérifié dans le rapport de migration (étape 6), pas seulement supposé** : `remainingToTag = 0` **et** `members.missingUserIds` **vide** pour tous les utilisateurs actifs. Si cette liste n'est pas vide, la bascule est **interdite** : chaque utilisateur qu'elle contient perdrait immédiatement tout accès aux collections concernées (voir note ci-dessous).
- Commande : `cp firestore.rules.stage-b firestore.rules`, puis `firebase deploy --only firestore:rules --project orizon-flight-director-test --dry-run` (vérification de compilation, déjà systématiquement faite dans cette session), puis, sur approbation séparée, `firebase deploy --only firestore:rules --project orizon-flight-director-test`.
- Observer : un compte Étudiant ne voit plus `aircraft`/`snags` et seulement ses propres réservations; toute tentative d'écriture sans `orgId` sur les 9 collections concernées échoue; les comptes déjà migrés continuent de fonctionner normalement.
- Retour arrière (rapide et sans risque de perte de données, contrairement à l'étape 6) : Console Firebase → Règles → republier la version de l'étape 3 (étape A), ou garder une copie de `firestore.rules` d'avant cette bascule (`git show ac14687:firestore.rules`) puis redéployer. L'étape A reste compatible avec des documents déjà étiquetés `orgId` : aucune donnée n'est perdue en revenant en arrière sur les règles seules.

### Étape 9 — Tests manuels (liste D9)
- Dérouler manuellement les points (a) à (k) de D9 sur le projet de test avec de vrais comptes (un par rôle/organisation). Les tests d'émulateur (37/37, voir plus haut) couvrent déjà le comportement des règles elles-mêmes; cette étape valide l'intégration réelle (client + règles + routes serveur `/api/oma/sign-card`, `/api/pin/verify`).

### Entre l'étape 3 (règles A) et la fin de la migration : utilisateur sans organisation
- **Après l'étape 3 et avant l'étape 6 (migration exécutée)** : un utilisateur sans `schoolOrgId`/`mroOrgId` continue de tout voir et écrire exactement comme avant (`schoolScope()` renvoie `[]`, aucune contrainte `orgId` sur ses requêtes; les règles étape A n'exigent `orgId` sur aucune collection préexistante). Aucune dégradation, aucune erreur.
- **Après l'étape 8 (règles stage-b déployées)** : ce même utilisateur, s'il n'a toujours pas de fiche `organizations/{orgId}/members/{uid}` (migration non exécutée pour lui, ou compte créé après la migration sans être ajouté à une organisation), perd **immédiatement et totalement** l'accès aux 9 collections concernées (refus, pas de dégradation partielle) — d'où le pré-requis explicite de l'étape 8 (`members.missingUserIds` vide). Un compte créé après la bascule stage-b (nouvel employé, par exemple) doit être ajouté à son organisation via le panneau Administration → Organisations au moment de sa création, sans quoi il sera bloqué dès sa première connexion sur les écrans Flotte/SNAG/Horaire/Instructeurs (NIP).

## D13. Retour d'utilisation : lisibilité du flux et annulation avant signature
Suite à un essai direct de l'interface (pas un rapport de bug technique) : le flux OMA était difficile à lire à l'œil (aucune indication « vous en êtes ici / prochaine action »), et il n'existait aucun moyen d'annuler un bon de travail ou une carte créés par erreur, quel que soit leur état. Deux décisions du propriétaire, appliquées ci-dessous.

### Bandeau « vous en êtes ici / prochaine action » et indicateur de progression
- Affichage seulement : `src/features/oma/statusText.ts` calcule un texte humain (`describeSchoolStep`, `describeOmaStep`) à partir des mêmes conditions qui déterminaient déjà quels boutons afficher (statut du bon, `signerUids`, rôle). **Aucune règle Firestore ni logique de statut n'a changé** pour cette partie.
- `cardProgress(cards)` compte fermées/annulées/total à partir des cartes réellement chargées côté client, plutôt que des compteurs dénormalisés du projet (`cardCount`/`openCardCount`) — nécessaire parce que ces compteurs ne distinguent pas une carte fermée par signature d'une carte annulée (les deux décrémentent `openCardCount` de la même façon, voir plus bas); compter depuis les cartes chargées donne un nombre exact.
- Monté dans `OmaPage.tsx` (`SchoolOrderPanel`) et `OmaMro.tsx` (`ProjectPanel`), réutilise la classe CSS `notice` déjà utilisée partout ailleurs — aucune nouvelle feuille de style.

### Annulation avant signature (D4/D10 étendus, jamais de suppression)
- **Justification réglementaire** : conformément au MCM/MPM art. 10, rien n'est jamais supprimé une fois qu'une signature existe — seulement avant. La distinction n'est donc pas « brouillon vs autre », mais « signé vs non signé », peu importe le statut administratif du bon ou de la carte.
- **`workCards`** : nouveau statut `annulee`, atteignable **uniquement** depuis `ouvert` — ce statut garantissait déjà, par construction, l'absence de signature (une carte ne passe à `ferme` que dans le même commit que sa signature, D6). Pas de suppression physique (`allow delete: if false;` inchangé). Décrémente `openCardCount` du projet dans le même commit (nouveau champ `lastCancelledCardId`, même mécanisme que `lastClosedCardId`); `cardCount` **ne change pas** — la carte a existé, elle reste comptée, comme une fermeture normale. Autorisée au technicien assigné ou au PRM/admin de l'OMA.
- **`workOrders`** : nouveau statut `annule`, atteignable depuis `brouillon`/`transmis`/`pris_en_charge`/`rapport_depose` — **jamais** depuis `controle_prm` (le contrôle a déjà commencé). Gardé par `!exists(projects/{id}) || projects/{id}.signerUids.size() == 0` — réutilise directement le mécanisme déjà en place pour la séparation des tâches (D4/D10), pas un nouveau champ. **Réservée au PRM/admin de l'école émettrice** (`orgHasRole(resource.data.orgId,...)`) — l'OMA ne peut jamais annuler un bon, seulement s'abstenir d'agir.
- **Un bon annulé lié à un SNAG ne referme pas le SNAG automatiquement** — confirmé voulu par le propriétaire : le SNAG reste ouvert, en attente d'un autre bon de travail.
- **Simplicité d'application, confirmée en la codant** : les deux garde-fous (`status == 'ouvert'` pour une carte, `signerUids.size() == 0` pour un bon) réutilisent des invariants et des champs déjà en place et déjà testés (D4, D6, D10) — aucun changement de structure des données existantes, seulement l'ajout de deux statuts terminaux, d'un champ (`cancelled` sur `WorkOrder`/`WorkCard`, `lastCancelledCardId` sur `Project`) et d'une branche de règle par collection, sur le même modèle que les branches déjà écrites.
- **Tests d'émulateur** (`tests/firestore-rules/oma-workflow.spec.ts`, 5 cas × 2 étapes de règles = 10 tests, 47/47 au total avec les précédents) : annulation d'un bon permise avant signature; refusée dès qu'une carte du projet est signée (même si le bon est encore à un statut par ailleurs annulable); refusée à un membre de l'OMA (réservée à l'émetteur); annulation d'une carte ouverte permise, avec vérification que `openCardCount` décrémente et que `cardCount` reste inchangé; refusée sur une carte déjà fermée/signée.

### Gap résiduel identifié en implémentant, non corrigé (signalé plutôt que tranché)
Les règles de `workCards` ne vérifient **jamais** le statut du `workOrder` parent. Concrètement : si un bon de travail est annulé alors que son projet contient encore des cartes **ouvertes non signées** (le seul cas où l'annulation est permise), rien n'empêche un technicien de continuer à modifier et **signer** ces cartes orphelines après coup — la règle de signature ne regarde que l'état de la carte elle-même, jamais celui du bon. Ce n'est pas un trou dans la garde d'annulation elle-même (qui reste correcte : on ne peut pas annuler un bon dont une carte est *déjà* signée), mais un manque de verrouillage a posteriori des cartes restantes d'un bon annulé. Corriger ça demanderait d'ajouter, à la règle de signature des cartes, une lecture du statut du `workOrder` parent (`get(workOrders/…).data.status != 'annule'`) — un changement mineur mais qui n'était pas dans le périmètre décidé pour ce tour-ci; je ne l'ai pas fait sans confirmation.
