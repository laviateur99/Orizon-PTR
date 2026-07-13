# Configuration Firebase — Orizon Flight Director

## 1. Créer le projet Firebase

Va sur Firebase Console et crée un projet :

`orizon-flight-director`

Active ensuite :

- Authentication
- Firestore Database
- Storage

## 2. Créer l'application Web

Dans Firebase :

Project settings → Your apps → Web app

Copie les valeurs dans `.env.local`.

## 3. Créer `.env.local`

Copie :

```bash
cp .env.local.example .env.local
```

Puis remplis les valeurs.

## 4. Lancer localement

```bash
npm install
npm run dev
```

Va dans :

`http://localhost:3000/admin`

Puis clique sur :

`Migrer vers Firestore`

## 5. Déploiement recommandé

Pour le premier déploiement, utiliser Vercel.

Plus tard, on pourra basculer vers Firebase Hosting si désiré.
