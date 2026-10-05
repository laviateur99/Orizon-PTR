"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeOrganizations } from "@/features/organizations/firestore";
import type { Organization } from "@/features/organizations/types";
import {
  createInventoryItem, deleteInventoryItem, subscribeAircraftComponents, subscribeInventory, updateInventoryItem, type InventoryInput,
} from "./firestore";
import type { AircraftComponent, InventoryItem } from "./types";

const EMPTY_FORM: InventoryInput = { partNumber: "", description: "", serialNumber: "", quantity: 1, location: "" };

const errorText = (value: unknown, fallback: string) => {
  const raw = value instanceof Error ? value.message : fallback;
  return /permission/i.test(raw) ? "Refusé par les règles de sécurité : rôle PRM requis pour gérer l’inventaire." : raw;
};

/**
 * Inventaire de pièces de l'école (section Maintenance). Partagé avec l'OMA : elle peut y prendre des pièces
 * dans une carte de travail; la certification déduit alors le stock et crée la composante sur l'avion.
 */
export function InventoryPanel() {
  const { profile } = useAuth();
  const schoolOrgId = profile?.schoolOrgId || "";
  // Même règle que les règles Firestore : écriture réservée au PRM (rôle Maintenance) et à l'administrateur.
  const canWrite = profile?.role === "Maintenance" || profile?.role === "Administrateur";
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [components, setComponents] = useState<AircraftComponent[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [form, setForm] = useState<InventoryInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);

  const mroOrg = orgs.find(org => org.type === "mro");
  const mroName = mroOrg?.name || "OMA";

  useEffect(() => subscribeOrganizations(setOrgs, () => setOrgs([])), []);
  useEffect(() => schoolOrgId ? subscribeInventory("school", schoolOrgId, setItems, () => setItems([])) : undefined, [schoolOrgId]);
  useEffect(() => schoolOrgId ? subscribeAircraftComponents(schoolOrgId, setComponents, () => setComponents([])) : undefined, [schoolOrgId]);

  // Composantes groupées par avion, les plus récentes d'abord.
  const byAircraft = useMemo(() => {
    const groups = new Map<string, AircraftComponent[]>();
    for (const component of components) {
      const list = groups.get(component.aircraftRegistration) || [];
      list.push(component);
      groups.set(component.aircraftRegistration, list);
    }
    for (const list of groups.values()) list.sort((a, b) => (b.installedAt || "").localeCompare(a.installedAt || ""));
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [components]);

  function edit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({ partNumber: item.partNumber, description: item.description, serialNumber: item.serialNumber, quantity: item.quantity, location: item.location });
    setMessage("");
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!mroOrg) { setMessage("Aucune organisation OMA n’existe encore."); setMessageError(true); return; }
    const input: InventoryInput = {
      partNumber: form.partNumber.trim(), description: form.description.trim(), location: form.location.trim(),
      serialNumber: form.serialNumber.trim(),
      // Une pièce suivie par S/N est unique : quantité 1.
      quantity: form.serialNumber.trim() ? 1 : Math.max(0, Math.floor(Number(form.quantity) || 0)),
    };
    setBusy(true); setMessage(""); setMessageError(false);
    try {
      if (editingId) await updateInventoryItem(editingId, input);
      else await createInventoryItem(schoolOrgId, mroOrg.id, input, { uid: profile?.uid || "", name: profile?.name || profile?.email || "" });
      setMessage(editingId ? "Pièce mise à jour." : "Pièce ajoutée à l’inventaire.");
      reset();
    } catch (error) { setMessage(errorText(error, "Enregistrement impossible.")); setMessageError(true); }
    finally { setBusy(false); }
  }

  async function remove(item: InventoryItem) {
    if (!window.confirm(`Supprimer ${item.partNumber} de l’inventaire ?`)) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try { await deleteInventoryItem(item.id); setMessage("Pièce supprimée."); }
    catch (error) { setMessage(errorText(error, "Suppression impossible.")); setMessageError(true); }
    finally { setBusy(false); }
  }

  if (!profile?.schoolOrgId) return <div className="notice warning">Ce compte n’est rattaché à aucune organisation école : l’inventaire n’est pas accessible.</div>;

  return <section className="card oma-side">
    <header><span className="badge ok">Inventaire</span><h2>Inventaire de pièces</h2>
      <p>Partagé avec {mroName}. Les pièces prises pour une carte sont déduites ici et ajoutées aux composantes de l’avion à la certification.</p></header>
    {message && <div className={`notice ${messageError ? "error" : ""}`}>{message}</div>}

    {canWrite && <form className="form-grid" onSubmit={save}>
      <label>N° de pièce<input required value={form.partNumber} onChange={e => setForm({ ...form, partNumber: e.target.value })} /></label>
      <label>Description<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>S/N (si suivie par numéro de série)<input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} /></label>
      <label>Quantité<input type="number" min={0} disabled={Boolean(form.serialNumber.trim())} value={form.serialNumber.trim() ? 1 : form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
      <label>Emplacement<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
      <div>
        <button className="button" disabled={busy}>{editingId ? "Enregistrer la modification" : "Ajouter à l’inventaire"}</button>
        {editingId && <button type="button" className="button secondary" disabled={busy} onClick={reset}>Annuler</button>}
      </div>
    </form>}

    {items.length === 0 && <p>Aucune pièce en inventaire.</p>}
    {items.length > 0 && <div className="table-scroll"><table className="table">
      <thead><tr><th>N° de pièce</th><th>Description</th><th>S/N</th><th>Quantité</th><th>Emplacement</th><th>Statut</th>{canWrite && <th />}</tr></thead>
      <tbody>{items.map(item => <tr key={item.id}>
        <td>{item.partNumber}</td><td>{item.description || "—"}</td><td>{item.serialNumber || "—"}</td>
        <td>{item.quantity}</td><td>{item.location || "—"}</td>
        <td>{item.quantity === 0 ? <span className="badge">Épuisée</span> : <span className="badge ok">Disponible pour {mroName}</span>}{item.lastInstalledCardId && <small className="muted"> · installée (carte {item.lastInstalledCardId})</small>}</td>
        {canWrite && <td className="table-actions">
          <button className="button secondary small" disabled={busy} onClick={() => edit(item)}>Modifier</button>
          {!item.lastInstalledCardId && <button className="button secondary small" disabled={busy} onClick={() => remove(item)}>Supprimer</button>}
        </td>}
      </tr>)}</tbody>
    </table></div>}

    <h3>Composantes installées sur les avions</h3>
    {byAircraft.length === 0 && <p>Aucune composante installée pour l’instant. Elles apparaissent à la certification d’une carte OMA.</p>}
    {byAircraft.map(([registration, list]) => <div className="oma-history" key={registration}>
      <strong>{registration}</strong>
      <table className="table">
        <thead><tr><th>Installée le</th><th>N° de pièce</th><th>S/N</th><th>Quantité</th><th>Carte</th><th>Installée par</th></tr></thead>
        <tbody>{list.map(component => <tr key={component.id}>
          <td>{component.installedAt ? new Date(component.installedAt).toLocaleString("fr-CA") : "—"}</td>
          <td>{component.partNumber}</td><td>{component.serialNumber || "—"}</td><td>{component.quantity}</td>
          <td>{component.cardId}</td><td>{component.installedBy.name || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
  </section>;
}
