"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { addOrgMember, subscribeOrgMembers, updateMemberLicense } from "./firestore";
import { runOrganizationMigration, type MigrationReport } from "./migration";
import { LICENSE_CLASSES, LICENSE_TYPES, ORG_MRO_ID, type LicenseClass, type LicenseType, type OrgMember, type OrgRole } from "./types";

type UserOption = { uid: string; name: string; email: string };

export function OrganizationsAdminPanel() {
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [omaMembers, setOmaMembers] = useState<OrgMember[]>([]);
  const [form, setForm] = useState({ userId: "", role: "technician" as OrgRole, licenseType: "ACA" as LicenseType, licenseNumber: "", licenseClass: "Maintenance" as LicenseClass });
  const [message, setMessage] = useState("");

  useEffect(() => onSnapshot(collection(db, "users"), snap => setUsers(snap.docs.map(item => ({ uid: item.id, name: String(item.data().name || ""), email: String(item.data().email || "") })).sort((a, b) => a.name.localeCompare(b.name))), caught => setError(caught.message)), []);
  useEffect(() => subscribeOrgMembers(ORG_MRO_ID, setOmaMembers, () => setOmaMembers([])), []);

  async function migrate(dryRun: boolean) {
    if (!dryRun && !window.confirm("Exécuter la migration ? Elle écrit orgId sur les documents existants (aircraft, snags, reservations, notifications, instructorPins) et crée les organisations et fiches de membres. Faites d’abord une simulation.")) return;
    setBusy(true); setError(""); setMessage("");
    try { setReport(await runOrganizationMigration({ dryRun })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Migration impossible."); }
    finally { setBusy(false); }
  }

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    const user = users.find(item => item.uid === form.userId);
    if (!user) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await addOrgMember(ORG_MRO_ID, "mro", user.uid, { role: form.role, displayName: user.name || user.email });
      if (form.role === "technician") await updateMemberLicense(ORG_MRO_ID, user.uid, { licenseType: form.licenseType, licenseNumber: form.licenseNumber.trim(), licenseClass: form.licenseClass });
      setMessage(`${user.name || user.email} ajouté à l’OMA.`);
      setForm({ ...form, userId: "", licenseNumber: "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ajout impossible (l’organisation OMA existe-t-elle? exécutez la migration)."); }
    finally { setBusy(false); }
  }

  return <section className="card organizations-admin">
    <header><span className="badge ok">Multi-organisation</span><h2>Organisations et OMA</h2>
      <p>Migration ponctuelle vers le modèle école / OMA, puis gestion des membres de l’OMA. Toujours lancer la simulation d’abord.</p></header>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    <div className="form-actions" style={{ justifyContent: "flex-start" }}>
      <button className="button secondary" disabled={busy} onClick={() => migrate(true)}>{busy ? "Analyse…" : "Simuler la migration"}</button>
      <button className="button" disabled={busy} onClick={() => migrate(false)}>Exécuter la migration</button>
    </div>

    {report && <div className="migration-report">
      <h3>{report.dryRun ? "Simulation (aucune écriture)" : "Migration exécutée"}</h3>
      <p>Organisations à créer : {report.organizations.toCreate.join(", ") || "aucune"} · existantes : {report.organizations.existing.join(", ") || "aucune"}</p>
      <p>Fiches membres : {report.members.scanned} utilisateurs, {report.dryRun ? `${report.members.toCreate} à créer` : `${report.members.created} créées (${report.members.toCreate} prévues)`} · champs utilisateur : {report.dryRun ? `${report.users.toUpdate} à mettre à jour` : `${report.users.updated} mis à jour`}</p>
      <div className="user-list"><div className="user-list-head" style={{ gridTemplateColumns: "1.4fr repeat(5,1fr)", minWidth: 0 }}><span>Collection</span><span>Analysés</span><span>Déjà étiquetés</span><span>À étiqueter</span><span>Étiquetés</span><span>Erreurs</span></div>
        {report.collections.map(item => <div className="user-list-row" style={{ gridTemplateColumns: "1.4fr repeat(5,1fr)", minWidth: 0 }} key={item.collection}><strong>{item.collection}</strong><span>{item.scanned}</span><span>{item.alreadyTagged}{item.taggedAsOma ? ` (dont ${item.taggedAsOma} OMA)` : ""}</span><span>{item.toTag}</span><span>{report.dryRun ? "—" : item.tagged}</span><span className={item.errors.length ? "badge danger" : ""}>{item.errors.length}</span></div>)}
      </div>
      {report.collections.filter(item => item.errors.length).map(item => <div className="notice error" key={item.collection}><strong>{item.collection}</strong> : {item.errors.slice(0, 5).map(entry => `${entry.id} (${entry.message})`).join(" · ")}{item.errors.length > 5 ? ` … +${item.errors.length - 5}` : ""}</div>)}
      {[...report.members.errors, ...report.users.errors].length > 0 && <div className="notice error">Erreurs membres/utilisateurs : {[...report.members.errors, ...report.users.errors].slice(0, 5).map(entry => `${entry.id} (${entry.message})`).join(" · ")}</div>}
      <p><strong>Documents restant à étiqueter : {report.remainingToTag}</strong>{report.remainingToTag === 0 && !report.dryRun ? " — la migration est complète, l’étape B (requêtes filtrées + règles strictes) peut être déployée." : ""}</p>
      {report.staffing.map(item => <div key={item.orgId}>
        <p>Effectif <strong>{item.orgId}</strong> : {item.members} membre(s) actif(s), {item.controllers} pouvant tenir le rôle de PRM.</p>
        {item.warnings.map(warning => <div className="notice warning" key={warning}>⚠ {warning}</div>)}
      </div>)}
    </div>}

    <h3>Membres de l’OMA</h3>
    <div className="user-list">{omaMembers.map(member => <div className="user-list-row" style={{ gridTemplateColumns: "1.4fr 1fr 1.5fr", minWidth: 0 }} key={member.userId}><strong>{member.displayName || member.userId}</strong><span>{member.role}</span><span>{member.licenseNumber ? `${member.licenseType} ${member.licenseNumber} — ${member.licenseClass}` : "Licence non renseignée"}</span></div>)}
      {!omaMembers.length && <p>Aucun membre (ou organisation non créée).</p>}</div>
    <form className="form-grid" onSubmit={addMember}>
      <label>Utilisateur<select required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}><option value="">Sélectionner…</option>{users.map(user => <option value={user.uid} key={user.uid}>{user.name || user.email}</option>)}</select></label>
      <label>Rôle dans l’OMA<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as OrgRole })}><option value="technician">Technicien</option><option value="prm">PRM</option><option value="admin">Administrateur</option></select></label>
      {form.role === "technician" && <>
        <label>Type de licence<select value={form.licenseType} onChange={e => setForm({ ...form, licenseType: e.target.value as LicenseType })}>{LICENSE_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Numéro<input required value={form.licenseNumber} onChange={e => setForm({ ...form, licenseNumber: e.target.value })} /></label>
        <label>Classe<select value={form.licenseClass} onChange={e => setForm({ ...form, licenseClass: e.target.value as LicenseClass })}>{LICENSE_CLASSES.map(item => <option key={item}>{item}</option>)}</select></label>
      </>}
      <button className="button" disabled={busy || !form.userId}>Ajouter à l’OMA</button>
    </form>
  </section>;
}
