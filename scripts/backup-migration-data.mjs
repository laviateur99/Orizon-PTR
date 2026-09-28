#!/usr/bin/env node
// Sauvegarde/restauration en JSON local des collections touchées par l'outil de migration des
// organisations (docs/audit-maintenance.md, D2) : organizations (+ sous-collection members),
// users (orgIds/schoolOrgId/mroOrgId) et les cinq collections étiquetées aircraft, snags,
// reservations, notifications, instructorPins.
//
// Aucun compte de service n'existe pour ce projet (voir docs/audit-maintenance.md) : ce script
// utilise le SDK client Firebase avec les identifiants d'un compte Administrateur. Par défaut ils
// sont saisis de façon interactive (mot de passe masqué); ils peuvent aussi être fournis par les
// variables d'environnement BACKUP_ACCOUNT_EMAIL / BACKUP_ACCOUNT_PASSWORD, réglées dans le terminal
// de l'opérateur — jamais demandées dans le chat, jamais écrites dans un fichier par ce script. Les
// fichiers produits contiennent des données réelles potentiellement sensibles (élèves, employés,
// hash de NIP) : ils sont écrits dans backups/ (ignoré par git, voir .gitignore) et NE DOIVENT
// JAMAIS être committés.
//
// Usage :
//   node --env-file=.env.local scripts/backup-migration-data.mjs                       # export
//   node --env-file=.env.local scripts/backup-migration-data.mjs --restore <dossier>   # restaure
//   npm run backup:migration-data -- --restore <dossier>
//
// Avant tout lancement réel, vérifier que NEXT_PUBLIC_FIREBASE_PROJECT_ID (affiché ci-dessous dès
// le chargement de la config, avant toute connexion) est bien le projet de test visé.
//
// Voir "Restauration" plus bas pour les limites importantes (instructorPins notamment) : pour une
// restauration complète et fidèle (y compris instructorPins), préférer l'import Google Cloud d'un
// export géré (`gcloud firestore import`, voir docs/audit-maintenance.md D12) — ce script n'a pas
// les privilèges IAM nécessaires pour contourner les règles Firestore.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  Timestamp, collection, doc, getDocs, getFirestore, setDoc,
} from "firebase/firestore";

const COLLECTIONS = ["organizations", "users", "aircraft", "snags", "reservations", "notifications", "instructorPins"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Variable d'environnement manquante : ${name}.`);
    console.error("Lancez ce script avec : node --env-file=.env.local scripts/backup-migration-data.mjs");
    process.exit(1);
  }
  return value;
}

async function promptCredentials() {
  // Si le compte est fourni par variables d'environnement (dans le terminal de l'opérateur,
  // jamais dans un fichier ni demandé dans le chat), on les utilise sans rien afficher ni écrire.
  const envEmail = process.env.BACKUP_ACCOUNT_EMAIL;
  const envPassword = process.env.BACKUP_ACCOUNT_PASSWORD;
  if (envEmail && envPassword) {
    console.log(`Identifiants lus depuis BACKUP_ACCOUNT_EMAIL/BACKUP_ACCOUNT_PASSWORD (courriel : ${envEmail}).`);
    return { email: envEmail, password: envPassword };
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const email = await rl.question("Courriel du compte Administrateur : ");
  rl.close();
  // Saisie masquée du mot de passe (pas d'écho au terminal), sans dépendance externe.
  const password = await new Promise(resolve => {
    stdout.write("Mot de passe : ");
    const onData = char => {
      const str = char.toString("utf8");
      if (str === "\n" || str === "\r" || str === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(buffer);
        return;
      }
      if (str === "\u0003") { process.exit(1); } // Ctrl+C
      if (str === "\u007f") { buffer = buffer.slice(0, -1); return; } // backspace
      buffer += str;
    };
    let buffer = "";
    stdin.resume();
    stdin.setRawMode?.(true);
    stdin.on("data", onData);
  });
  return { email, password };
}

// --- Sérialisation JSON avec préservation des types Firestore (Timestamp) ---
function serializeValue(value) {
  if (value instanceof Timestamp) return { __type: "timestamp", iso: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeValue(v)]));
  }
  return value;
}
function deserializeValue(value) {
  if (value && typeof value === "object" && value.__type === "timestamp") return Timestamp.fromDate(new Date(value.iso));
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserializeValue(v)]));
  }
  return value;
}

async function exportRun(db, outDir) {
  mkdirSync(outDir, { recursive: true });
  const manifest = { exportedAt: new Date().toISOString(), projectId: db.app.options.projectId, collections: {} };

  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    const docs = snap.docs.map(d => ({ id: d.id, data: serializeValue(d.data()) }));
    writeFileSync(`${outDir}/${name}.json`, JSON.stringify(docs, null, 2));
    manifest.collections[name] = docs.length;
    console.log(`  ${name} : ${docs.length} document(s)`);

    if (name === "organizations") {
      mkdirSync(`${outDir}/organizations-members`, { recursive: true });
      for (const org of snap.docs) {
        const membersSnap = await getDocs(collection(db, "organizations", org.id, "members"));
        const members = membersSnap.docs.map(d => ({ id: d.id, data: serializeValue(d.data()) }));
        writeFileSync(`${outDir}/organizations-members/${org.id}.json`, JSON.stringify(members, null, 2));
        manifest.collections[`organizations/${org.id}/members`] = members.length;
        console.log(`    organizations/${org.id}/members : ${members.length} document(s)`);
      }
    }
  }
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\nExport terminé dans ${outDir}`);
  console.log("Rappel : ce dossier contient des données réelles. Ne jamais le committer ni le partager hors de l'équipe autorisée.");
}

async function restoreRun(db, inDir) {
  if (!existsSync(`${inDir}/manifest.json`)) {
    console.error(`Dossier invalide : ${inDir}/manifest.json introuvable.`);
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `Ceci va ÉCRASER les documents existants dans ${db.app.options.projectId} avec le contenu de ${inDir}.\n` +
    "Tapez RESTAURER en majuscules pour confirmer : ",
  );
  rl.close();
  if (answer !== "RESTAURER") { console.log("Annulé."); return; }

  const report = {};
  for (const name of COLLECTIONS) {
    const file = `${inDir}/${name}.json`;
    if (!existsSync(file)) continue;
    const docs = JSON.parse(readFileSync(file, "utf8"));
    const result = { restored: 0, denied: 0, errors: [] };
    for (const { id, data } of docs) {
      try {
        await setDoc(doc(db, name, id), deserializeValue(data));
        result.restored += 1;
      } catch (error) {
        const denied = String(error?.code || error?.message || "").includes("permission-denied");
        if (denied) result.denied += 1; else result.errors.push({ id, message: String(error?.message || error) });
      }
    }
    report[name] = result;
    console.log(`  ${name} : ${result.restored} restauré(s), ${result.denied} refusé(s) par les règles, ${result.errors.length} erreur(s)`);
  }
  writeFileSync(`${inDir}/restore-report-${Date.now()}.json`, JSON.stringify(report, null, 2));
  const deniedCollections = Object.entries(report).filter(([, r]) => r.denied > 0).map(([name]) => name);
  if (deniedCollections.length) {
    console.log(`\nDocuments refusés par les règles de sécurité dans : ${deniedCollections.join(", ")}.`);
    console.log("C'est attendu pour instructorPins (voir la section « Restauration » du script) : seul l'instructeur");
    console.log("propriétaire peut réécrire son propre hash de NIP; un administrateur ne le peut pas, par conception.");
  }
}

async function main() {
  const firebaseConfig = {
    apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  // Affiché en premier, avant toute connexion : c'est le seul champ de config qu'un opérateur
  // doit vérifier à l'œil avant de continuer (docs/audit-maintenance.md, D12).
  console.log(`NEXT_PUBLIC_FIREBASE_PROJECT_ID = ${firebaseConfig.projectId}`);
  if (!/(test|staging|sandbox|demo)/i.test(firebaseConfig.projectId)) {
    console.error(`Refusé : ce script ne s'exécute que contre un projet de test (projectId actuel : ${firebaseConfig.projectId}).`);
    process.exit(1);
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const { email, password } = await promptCredentials();
  await signInWithEmailAndPassword(auth, email, password);
  console.log(`Connecté en tant que ${email} sur le projet ${firebaseConfig.projectId}.\n`);

  const restoreIndex = process.argv.indexOf("--restore");
  if (restoreIndex !== -1) {
    const dir = process.argv[restoreIndex + 1];
    if (!dir) { console.error("Usage : --restore <dossier>"); process.exit(1); }
    await restoreRun(db, dir);
  } else {
    const outDir = `backups/migration/${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await exportRun(db, outDir);
  }
  process.exit(0);
}

main().catch(error => {
  console.error("Échec :", error?.message || error);
  process.exit(1);
});
