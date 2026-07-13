# Architecture serveur — Orizon Flight Director v8.0

La version 8 ajoute une couche serveur Next.js.

## Routes ajoutées

- `/api/weather?station=CYQB`
- `/api/notam?station=CYQB`

## Pourquoi

Le navigateur ne devrait pas appeler directement les services externes. Le serveur Next.js sert d'intermédiaire afin de réduire les problèmes CORS, cacher les futures clés API et préparer les intégrations météo/NOTAM.
