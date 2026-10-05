"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { subscribeOrganizations } from "@/features/organizations/firestore";
import type { Organization } from "@/features/organizations/types";
import {
  createInventoryItem, deleteInventoryItem, subscribeAircraftComponents, subscribeInventory, subscribeInventoryHistory, subscribeItemHistory, updateInventoryItem, type InventoryInput,
} from "./firestore";
import type { AircraftComponent, InventoryAction, InventoryHistory, InventoryItem } from "./types";

const EMPTY_FORM: InventoryInput = { partNumber: "", description: "", serialNumber: "", quantity: 1, location: "" };
const ACTIONS: InventoryAction[] = ["Création", "Modification", "Suppression", "Installée sur avion"];
type StockFilter = "all" | "available" | "empty" | "installed";

const errorText = (value: unknown, fallback: string) => {
  const raw = value instanceof Error ? value.message : fallback;
  return /permission/i.test(raw) ? "Refusé par les règles de sécurité : rôle PRM requis pour gérer l’inventaire." : raw;
};
const dateText = (value?: string) => value ? new Date(value).toLocaleString("fr-CA") : "—";
const dayOf = (value?: string) => value ? value.slice(0, 10) : "";
const contains = (haystack: Array<string | undefined>, needle: string) => {
  const query = needle.trim().toLowerCase();
  return !query || haystack.some(value => (value || "").toLowerCase().includes(query));
};

/** Exporte des lignes en CSV (séparateur point-virgule, pour Excel en français). */
function downloadCsv(name: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + rows.map(row => row.map(escape).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

/** Historique d'une fiche : chaque mouvement de stock, du plus récent au plus ancien. */
function ItemHistory({ schoolOrgId, itemId }: { schoolOrgId: string; itemId: string }) {
  const [lines, setLines] = useState<InventoryHistory[]>([]);
  useEffect(() => subscribeItemHistory(schoolOrgId, itemId, setLines, () => setLines([])), [schoolOrgId, itemId]);
  const sorted = [...lines].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!sorted.length) return <p className="muted">Aucun mouvement enregistré pour cette pièce.</p>;
  return <table className="table">
    <thead><tr><th>Date</th><th>Action</th><th>Qté avant</th><th>Variation</th><th>Qté après</th><th>Avion / carte</th><th>Par</th></tr></thead>
    <tbody>{sorted.map(line => <tr key={line.id}>
      <td>{dateText(line.createdAt)}</td><td>{line.action}</td><td>{line.quantityBefore}</td>
      <td>{line.quantityChange > 0 ? `+${line.quantityChange}` : line.quantityChange}</td><td>{line.quantityAfter}</td>
      <td>{line.aircraftRegistration ? `${line.aircraftRegistration} · carte ${line.cardId}` : "—"}</td><td>{line.actor.name || "—"}</td>
    </tr>)}</tbody>
  </table>;
}

/**
 * Inventaire de pièces de l'école (section Maintenance). Partagé avec l'OMA : elle peut y prendre des pièces
 * dans une carte de travail; la certification déduit alors le stock, crée la composante sur l'avion et
 * inscrit le mouvement au journal.
 */
export function InventoryPanel() {
  const { profile, user } = useAuth();
  const schoolOrgId = profile?.schoolOrgId || "";
  // Même règle que les règles Firestore : écriture réservée au PRM (rôle Maintenance) et à l'administrateur.
  const canWrite = profile?.role === "Maintenance" || profile?.role === "Administrateur";
  const actor = { uid: user?.uid || profile?.uid || "", name: profile?.name || profile?.email || "" };
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [components, setComponents] = useState<AircraftComponent[]>([]);
  const [movements, setMovements] = useState<InventoryHistory[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [form, setForm] = useState<InventoryInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Recherche et filtres : stock
  const [stockText, setStockText] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [stockLocation, setStockLocation] = useState("");
  // Recherche et filtres : mouvements
  const [moveText, setMoveText] = useState("");
  const [moveAction, setMoveAction] = useState<"" | InventoryAction>("");
  const [moveFrom, setMoveFrom] = useState("");
  const [moveTo, setMoveTo] = useState("");
  // Recherche et filtres : composantes
  const [compText, setCompText] = useState("");
  const [compAircraft, setCompAircraft] = useState("");

  const mroOrg = orgs.find(org => org.type === "mro");
  const mroName = mroOrg?.name || "OMA";

  useEffect(() => subscribeOrganizations(setOrgs, () => setOrgs([])), []);
  useEffect(() => schoolOrgId ? subscribeInventory("school", schoolOrgId, setItems, () => setItems([])) : undefined, [schoolOrgId]);
  useEffect(() => schoolOrgId ? subscribeAircraftComponents(schoolOrgId, setComponents, () => setComponents([])) : undefined, [schoolOrgId]);
  useEffect(() => schoolOrgId ? subscribeInventoryHistory("school", schoolOrgId, setMovements, () => setMovements([])) : undefined, [schoolOrgId]);

  const locations = useMemo(() => [...new Set(items.map(item => item.location).filter(Boolean))].sort(), [items]);
  const aircraftList = useMemo(() => [...new Set(components.map(component => component.aircraftRegistration))].sort(), [components]);

  const filteredItems = useMemo(() => items
    .filter(item => {
      if (stockFilter === "available") return item.quantity > 0;
      if (stockFilter === "empty") return item.quantity === 0;
      if (stockFilter === "installed") return Boolean(item.lastInstalledCardId);
      return true;
    })
    .filter(item => !stockLocation || item.location === stockLocation)
    .filter(item => contains([item.partNumber, item.description, item.serialNumber, item.location, item.lastInstalledCardId], stockText))
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber)), [items, stockFilter, stockLocation, stockText]);

  const filteredMovements = useMemo(() => movements
    .filter(line => !moveAction || line.action === moveAction)
    .filter(line => !moveFrom || dayOf(line.createdAt) >= moveFrom)
    .filter(line => !moveTo || dayOf(line.createdAt) <= moveTo)
    .filter(line => contains([line.partNumber, line.serialNumber, line.aircraftRegistration, line.cardId, line.actor.name], moveText))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [movements, moveAction, moveFrom, moveTo, moveText]);

  // Composantes groupées par avion, les plus récentes d'abord.
  const filteredComponents = useMemo(() => components
    .filter(component => !compAircraft || component.aircraftRegistration === compAircraft)
    .filter(component => contains([component.partNumber, component.serialNumber, component.aircraftRegistration, component.cardId, component.installedBy.name], compText))
    .sort((a, b) => (b.installedAt || "").localeCompare(a.installedAt || "")), [components, compAircraft, compText]);

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
      const current = items.find(item => item.id === editingId);
      if (current) await updateInventoryItem(current, input, actor);
      else await createInventoryItem(schoolOrgId, mroOrg.id, input, actor);
      setMessage(current ? "Pièce mise à jour." : "Pièce ajoutée à l’inventaire.");
      reset();
    } catch (error) { setMessage(errorText(error, "Enregistrement impossible.")); setMessageError(true); }
    finally { setBusy(false); }
  }

  async function remove(item: InventoryItem) {
    if (!window.confirm(`Supprimer ${item.partNumber} de l’inventaire ? Le mouvement reste dans le journal.`)) return;
    setBusy(true); setMessage(""); setMessageError(false);
    try { await deleteInventoryItem(item, actor); setMessage("Pièce supprimée."); }
    catch (error) { setMessage(errorText(error, "Suppression impossible.")); setMessageError(true); }
    finally { setBusy(false); }
  }

  if (!profile?.schoolOrgId) return <div className="notice warning">Ce compte n’est rattaché à aucune organisation école : l’inventaire n’est pas accessible.</div>;

  return <section className="card oma-side">
    <header><span className="badge ok">Inventaire</span><h2>Inventaire de pièces</h2>
      <p>Partagé avec {mroName}. Les pièces prises pour une carte sont déduites ici, ajoutées aux composantes de l’avion et inscrites au journal à la certification.</p></header>
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

    <h3>Stock</h3>
    <div className="form-grid">
      <label>Rechercher (N° de pièce, description, S/N, emplacement, carte)<input value={stockText} onChange={e => setStockText(e.target.value)} placeholder="ex. 12345 ou C152" /></label>
      <label>Statut<select value={stockFilter} onChange={e => setStockFilter(e.target.value as StockFilter)}>
        <option value="all">Tous</option><option value="available">Disponibles</option><option value="empty">Épuisées</option><option value="installed">Déjà installées</option>
      </select></label>
      <label>Emplacement<select value={stockLocation} onChange={e => setStockLocation(e.target.value)}><option value="">Tous</option>{locations.map(location => <option key={location} value={location}>{location}</option>)}</select></label>
    </div>
    <p className="muted">{filteredItems.length} pièce(s) sur {items.length}.</p>
    {items.length === 0 && <p>Aucune pièce en inventaire.</p>}
    {filteredItems.length > 0 && <div className="table-scroll"><table className="table">
      <thead><tr><th>N° de pièce</th><th>Description</th><th>S/N</th><th>Quantité</th><th>Emplacement</th><th>Statut</th>{canWrite && <th />}</tr></thead>
      <tbody>{filteredItems.map(item => <Fragment key={item.id}>
        <tr>
          <td>{item.partNumber}</td><td>{item.description || "—"}</td><td>{item.serialNumber || "—"}</td>
          <td>{item.quantity}</td><td>{item.location || "—"}</td>
          <td>{item.quantity === 0 ? <span className="badge">Épuisée</span> : <span className="badge ok">Disponible pour {mroName}</span>}{item.lastInstalledCardId && <small className="muted"> · déjà installée</small>}</td>
          <td className="table-actions">
            <button className="button secondary small" onClick={() => setOpenHistory(openHistory === item.id ? null : item.id)}>{openHistory === item.id ? "Masquer l’historique" : "Historique"}</button>
            {canWrite && <button className="button secondary small" disabled={busy} onClick={() => edit(item)}>Modifier</button>}
            {canWrite && !item.lastInstalledCardId && <button className="button secondary small" disabled={busy} onClick={() => remove(item)}>Supprimer</button>}
          </td>
        </tr>
        {openHistory === item.id && <tr><td colSpan={canWrite ? 7 : 6}><ItemHistory schoolOrgId={schoolOrgId} itemId={item.id} /></td></tr>}
      </Fragment>)}</tbody>
    </table></div>}

    <h3>Mouvements de stock</h3>
    <div className="form-grid">
      <label>Rechercher (pièce, S/N, avion, carte, personne)<input value={moveText} onChange={e => setMoveText(e.target.value)} /></label>
      <label>Action<select value={moveAction} onChange={e => setMoveAction(e.target.value as "" | InventoryAction)}><option value="">Toutes</option>{ACTIONS.map(action => <option key={action} value={action}>{action}</option>)}</select></label>
      <label>Du<input type="date" value={moveFrom} onChange={e => setMoveFrom(e.target.value)} /></label>
      <label>Au<input type="date" value={moveTo} onChange={e => setMoveTo(e.target.value)} /></label>
    </div>
    <div className="table-actions">
      <span className="muted">{filteredMovements.length} mouvement(s).</span>
      <button className="button secondary small" disabled={!filteredMovements.length} onClick={() => downloadCsv("mouvements-inventaire.csv", [
        ["Date", "Action", "N° de pièce", "S/N", "Qté avant", "Variation", "Qté après", "Avion", "Carte", "Par"],
        ...filteredMovements.map(line => [dateText(line.createdAt), line.action, line.partNumber, line.serialNumber, line.quantityBefore, line.quantityChange, line.quantityAfter, line.aircraftRegistration || "", line.cardId || "", line.actor.name]),
      ])}>Exporter en CSV</button>
    </div>
    {filteredMovements.length > 0 && <div className="table-scroll"><table className="table">
      <thead><tr><th>Date</th><th>Action</th><th>N° de pièce</th><th>S/N</th><th>Qté avant</th><th>Variation</th><th>Qté après</th><th>Avion / carte</th><th>Par</th></tr></thead>
      <tbody>{filteredMovements.map(line => <tr key={line.id}>
        <td>{dateText(line.createdAt)}</td><td>{line.action}</td><td>{line.partNumber}</td><td>{line.serialNumber || "—"}</td>
        <td>{line.quantityBefore}</td><td>{line.quantityChange > 0 ? `+${line.quantityChange}` : line.quantityChange}</td><td>{line.quantityAfter}</td>
        <td>{line.aircraftRegistration ? `${line.aircraftRegistration} · ${line.cardId}` : "—"}</td><td>{line.actor.name || "—"}</td>
      </tr>)}</tbody>
    </table></div>}

    <h3>Composantes installées sur les avions</h3>
    <div className="form-grid">
      <label>Rechercher (pièce, S/N, carte, personne)<input value={compText} onChange={e => setCompText(e.target.value)} /></label>
      <label>Avion<select value={compAircraft} onChange={e => setCompAircraft(e.target.value)}><option value="">Tous</option>{aircraftList.map(registration => <option key={registration} value={registration}>{registration}</option>)}</select></label>
    </div>
    {filteredComponents.length === 0 && <p>Aucune composante ne correspond. Les composantes apparaissent à la certification d’une carte OMA.</p>}
    {filteredComponents.length > 0 && <div className="table-scroll"><table className="table">
      <thead><tr><th>Avion</th><th>Installée le</th><th>N° de pièce</th><th>S/N</th><th>Quantité</th><th>Carte</th><th>Installée par</th></tr></thead>
      <tbody>{filteredComponents.map(component => <tr key={component.id}>
        <td>{component.aircraftRegistration}</td><td>{dateText(component.installedAt)}</td><td>{component.partNumber}</td><td>{component.serialNumber || "—"}</td>
        <td>{component.quantity}</td><td>{component.cardId}</td><td>{component.installedBy.name || "—"}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
