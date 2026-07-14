"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resourceGroupKey,
  saveResourceGroupOrder,
  subscribeResourceGroupOrder,
  subscribeResources
} from "@/features/scheduler/firestore";
import type { SchedulerResource } from "@/features/scheduler/types";

const DEFAULT_GROUPS = [
  "Avions — Cessna 152",
  "Avions — Cessna 172",
  "Avions — Piper Navajo PA-31",
  "Simulateurs",
  "Instructeurs",
  "Locaux"
];

export function ResourceOrderPanel() {
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [savedGroups, setSavedGroups] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [updatedBy, setUpdatedBy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const offResources = subscribeResources({ next: setResources, error: value => setError(value.message) });
    const offOrder = subscribeResourceGroupOrder(value => setSavedGroups(value.groups), value => setError(value.message));
    return () => { offResources(); offOrder(); };
  }, []);

  const availableGroups = useMemo(() => {
    const discovered = Array.from(new Set(resources.map(resourceGroupKey)));
    return Array.from(new Set([...DEFAULT_GROUPS, ...savedGroups, ...discovered])).filter(group =>
      ["Simulateurs", "Instructeurs", "Locaux"].includes(group) || discovered.includes(group)
    );
  }, [resources, savedGroups]);

  useEffect(() => {
    setGroups([
      ...savedGroups.filter(item => availableGroups.includes(item)),
      ...availableGroups.filter(item => !savedGroups.includes(item))
    ]);
  }, [availableGroups, savedGroups]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const copy = [...groups];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setGroups(copy);
  }

  async function save() {
    await saveResourceGroupOrder(groups, updatedBy);
    setMessage("Ordre des groupes enregistré et appliqué.");
  }

  return (
    <section className="card resource-order-panel">
      <h2>Ordre des groupes dans l’horaire</h2>
      <p className="muted">L’ordre est défini par type : Cessna 152, Cessna 172, PA-31, simulateurs, instructeurs et locaux.</p>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <label>Modifié par<input value={updatedBy} onChange={event => setUpdatedBy(event.target.value)} placeholder="Nom de l’administrateur" /></label>
      <div className="resource-order-list">
        {groups.map((group, index) => (
          <div className="resource-order-row" key={group}>
            <span className="resource-order-number">{index + 1}</span>
            <div><strong>{group}</strong><small>{resources.filter(item => resourceGroupKey(item) === group).length} ressource(s)</small></div>
            <div>
              <button className="button secondary small" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button className="button secondary small" disabled={index === groups.length - 1} onClick={() => move(index, 1)}>↓</button>
            </div>
          </div>
        ))}
      </div>
      <button className="button" onClick={save}>Enregistrer l’ordre</button>
    </section>
  );
}
