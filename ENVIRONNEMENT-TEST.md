# Orizon Flight Director — environnement de test

Adresse : https://orizon-flight-director-test.vercel.app

Cette version est construite à partir du dossier local actif `/Users/rogersamson/Documents/Orizon-PTR`, incluant ses modifications locales du 30 juillet 2026.

## Fonctions incluses

- Étudiants et dossiers étudiants
- PTR, évaluations, impression et progression
- Horaire et réservations
- Instructeurs, employés, paie et validation des heures
- Flotte, SNAG, Maintenance, ordres de travail et tableaux de bord
- Formation théorique, programmes et urgence
- OCR et ressources documentaires Maintenance

## Séparation du test

- Firebase distinct : `orizon-flight-director-test`
- Base vide hébergée à Montréal; aucune donnée de production copiée
- Bannière jaune permanente
- Connexion par courriel activée
- Administrateur : `rsamson@orizonaviationqc.com`
- Bouton de commentaires et consultation dans Administration

La base de test étant vide, les modules sont présents, mais les étudiants, avions, réservations et PTR réels ne sont volontairement pas copiés. Utilisez des données fictives ou les outils de démonstration de la page Administration.

## Vérifications

- TypeScript : réussi
- Compilation Vercel : réussie
- Audit des dépendances : 0 vulnérabilité connue
- Règles Firebase complètes publiées dans le projet de test
