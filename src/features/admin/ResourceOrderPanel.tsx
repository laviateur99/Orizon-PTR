"use client";

import { useEffect, useMemo, useState } from "react";
import {
  resourceGroupKey,
  saveResourceOrderSettings,
  subscribeResourceOrderSettings,
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
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [resourceOrder, setResourceOrder] =
    useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const offResources = subscribeResources({
      next: setResources,
      error: value => setError(value.message)
    });

    const offSettings = subscribeResourceOrderSettings(
      value => {
        if (value.groups.length) setGroups(value.groups);
        setResourceOrder(value.resources);
      },
      value => setError(value.message)
    );

    return () => {
      offResources();
      offSettings();
    };
  }, []);

  const availableGroups = useMemo(() => {
    const discovered = Array.from(
      new Set(resources.map(resourceGroupKey))
    );
    return Array.from(
      new Set([...groups, ...DEFAULT_GROUPS, ...discovered])
    ).filter(group =>
      discovered.includes(group) ||
      ["Simulateurs", "Instructeurs", "Locaux"].includes(group)
    );
  }, [groups, resources]);

  useEffect(() => {
    setGroups(current => [
      ...current.filter(group => availableGroups.includes(group)),
      ...availableGroups.filter(group => !current.includes(group))
    ]);

    setResourceOrder(current => {
      const next = { ...current };
      availableGroups.forEach(group => {
        const ids = resources
          .filter(item => resourceGroupKey(item) === group)
          .map(item => item.id);
        next[group] = [
          ...(next[group] || []).filter(id => ids.includes(id)),
          ...ids.filter(id => !(next[group] || []).includes(id))
        ];
      });
      return next;
    });
  }, [availableGroups, resources]);

  function moveGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const copy = [...groups];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setGroups(copy);
  }

  function moveResource(
    group: string,
    index: number,
    direction: -1 | 1
  ) {
    const items = [...(resourceOrder[group] || [])];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setResourceOrder(current => ({
      ...current,
      [group]: items
    }));
  }

  async function save() {
    await saveResourceOrderSettings({
      groups,
      resources: resourceOrder
    });
    setMessage("Ordre des groupes et des ressources enregistré.");
  }

  return (
    <section className="card resource-order-panel">
      <h2>Ordre de l’horaire</h2>
      <p className="muted">
        Modifie l’ordre des groupes, puis l’ordre des ressources à l’intérieur de chaque groupe.
      </p>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="resource-groups-admin">
        {groups.map((group, groupIndex) => {
          const ids = resourceOrder[group] || [];
          const groupResources = ids
            .map(id => resources.find(item => item.id === id))
            .filter((item): item is SchedulerResource => Boolean(item));

          return (
            <section className="resource-group-admin" key={group}>
              <header>
                <div>
                  <strong>{group}</strong>
                  <small>{groupResources.length} ressource(s)</small>
                </div>
                <div>
                  <button
                    className="button secondary small"
                    disabled={groupIndex === 0}
                    onClick={() => moveGroup(groupIndex, -1)}
                  >
                    Groupe ↑
                  </button>
                  <button
                    className="button secondary small"
                    disabled={groupIndex === groups.length - 1}
                    onClick={() => moveGroup(groupIndex, 1)}
                  >
                    Groupe ↓
                  </button>
                </div>
              </header>

              <div className="resource-inside-group">
                {groupResources.map((resource, index) => (
                  <div className="resource-order-row" key={resource.id}>
                    <span className="resource-order-number">
                      {index + 1}
                    </span>
                    <div>
                      <strong>{resource.name}</strong>
                      <small>{resource.detail}</small>
                    </div>
                    <div>
                      <button
                        className="button secondary small"
                        disabled={index === 0}
                        onClick={() =>
                          moveResource(group, index, -1)
                        }
                      >
                        ↑
                      </button>
                      <button
                        className="button secondary small"
                        disabled={index === groupResources.length - 1}
                        onClick={() =>
                          moveResource(group, index, 1)
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <button className="button" onClick={save}>
        Enregistrer l’ordre complet
      </button>
    </section>
  );
}
