"use client";

import { useEffect, useState } from "react";
import {
  saveResourceScheduleOrder,
  subscribeResources
} from "@/features/scheduler/firestore";
import type { SchedulerResource } from "@/features/scheduler/types";

function kindLabel(kind: SchedulerResource["kind"]) {
  if (kind === "aircraft") return "Avion";
  if (kind === "simulator") return "Simulateur";
  if (kind === "instructor") return "Instructeur";
  return "Local";
}

export function ResourceOrderPanel() {
  const [items, setItems] = useState<SchedulerResource[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeResources({
        next: resources =>
          setItems(
            [...resources].sort(
              (a, b) =>
                (a.order ?? 9999) - (b.order ?? 9999) ||
                a.name.localeCompare(b.name)
            )
          ),
        error: value => setError(value.message)
      }),
    []
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    setItems(copy);
  }

  async function save() {
    await saveResourceScheduleOrder(
      items.map((item, index) => ({
        id: item.id,
        kind: item.kind,
        order: index
      }))
    );
    setMessage("Ordre des ressources enregistré.");
  }

  return (
    <section className="card resource-order-panel">
      <h2>Ordre des ressources dans l’horaire</h2>
      <p className="muted">
        Utilise les flèches pour placer les avions, simulateurs, instructeurs et locaux dans l’ordre désiré.
      </p>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="resource-order-list">
        {items.map((item, index) => (
          <div className="resource-order-row" key={`${item.kind}-${item.id}`}>
            <span className="resource-order-number">{index + 1}</span>
            <div>
              <strong>{item.name}</strong>
              <small>{kindLabel(item.kind)} · {item.detail}</small>
            </div>
            <div>
              <button
                className="button secondary small"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                className="button secondary small"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="button" onClick={save}>
        Enregistrer l’ordre
      </button>
    </section>
  );
}
