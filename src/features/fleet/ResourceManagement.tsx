"use client";

import { useEffect, useMemo, useState } from "react";
import {
  newAircraftTemplate,
  newResourceTemplate,
  removeAircraft,
  removeManagedResource,
  saveManagedResource,
  subscribeManagedResources,
  type ManagedResource
} from "./resources";
import { saveAircraft } from "./firestore";
import type { Aircraft } from "./types";

export function ResourceManagement({
  aircraft
}: {
  aircraft: Aircraft[];
}) {
  const [resources, setResources] = useState<ManagedResource[]>([]);
  const [aircraftDraft, setAircraftDraft] = useState<Aircraft | null>(null);
  const [resourceDraft, setResourceDraft] =
    useState<ManagedResource | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeManagedResources({
        next: setResources,
        error: value => setError(value.message)
      }),
    []
  );

  const simulators = useMemo(
    () => resources.filter(item => item.resourceType === "Simulateur"),
    [resources]
  );
  const rooms = useMemo(
    () => resources.filter(item => item.resourceType === "Local"),
    [resources]
  );

  async function saveAircraftDraft() {
    if (!aircraftDraft) return;
    const registration = aircraftDraft.registration.trim().toUpperCase();
    if (!registration || !aircraftDraft.typeLabel.trim()) {
      setMessage("L’immatriculation et le type sont obligatoires.");
      return;
    }
    await saveAircraft({
      ...aircraftDraft,
      id: registration,
      registration
    });
    setAircraftDraft(null);
    setMessage("Avion enregistré.");
  }

  async function saveResourceDraft() {
    if (!resourceDraft) return;
    if (!resourceDraft.name.trim()) {
      setMessage("Le nom de la ressource est obligatoire.");
      return;
    }
    const id =
      resourceDraft.id.startsWith("RESOURCE-")
        ? `${resourceDraft.resourceType === "Simulateur" ? "SIM" : "ROOM"}-${resourceDraft.name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "-")}`
        : resourceDraft.id;
    await saveManagedResource({
      ...resourceDraft,
      id
    });
    setResourceDraft(null);
    setMessage("Ressource enregistrée.");
  }

  return (
    <section className="card resource-management">
      <header className="resource-management-head">
        <div>
          <h2>Gestion des ressources</h2>
          <p>
            Ajouter, modifier ou retirer des avions, simulateurs et locaux.
          </p>
        </div>
        <div className="resource-add-actions">
          <button
            className="button"
            onClick={() => setAircraftDraft(newAircraftTemplate())}
          >
            Ajouter un avion
          </button>
          <button
            className="button secondary"
            onClick={() =>
              setResourceDraft(newResourceTemplate("Simulateur"))
            }
          >
            Ajouter un simulateur
          </button>
          <button
            className="button secondary"
            onClick={() => setResourceDraft(newResourceTemplate("Local"))}
          >
            Ajouter un local
          </button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="resource-admin-columns">
        <div>
          <h3>Avions</h3>
          {aircraft.map(item => (
            <div className="resource-admin-row" key={item.id}>
              <div>
                <strong>{item.registration}</strong>
                <span>{item.typeLabel}</span>
              </div>
              <div>
                <button
                  className="button secondary small"
                  onClick={() => setAircraftDraft(item)}
                >
                  Modifier
                </button>
                <button
                  className="button danger small"
                  onClick={async () => {
                    if (
                      confirm(
                        `Retirer définitivement ${item.registration} de la flotte?`
                      )
                    ) {
                      await removeAircraft(item.id);
                      setMessage("Avion retiré.");
                    }
                  }}
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3>Simulateurs</h3>
          {simulators.map(item => (
            <div className="resource-admin-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
              <div>
                <button
                  className="button secondary small"
                  onClick={() => setResourceDraft(item)}
                >
                  Modifier
                </button>
                <button
                  className="button danger small"
                  onClick={async () => {
                    if (confirm(`Retirer ${item.name}?`)) {
                      await removeManagedResource(item.id);
                      setMessage("Simulateur retiré.");
                    }
                  }}
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
          {!simulators.length && <p>Aucun simulateur enregistré.</p>}
        </div>

        <div>
          <h3>Locaux</h3>
          {rooms.map(item => (
            <div className="resource-admin-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
              <div>
                <button
                  className="button secondary small"
                  onClick={() => setResourceDraft(item)}
                >
                  Modifier
                </button>
                <button
                  className="button danger small"
                  onClick={async () => {
                    if (confirm(`Retirer ${item.name}?`)) {
                      await removeManagedResource(item.id);
                      setMessage("Local retiré.");
                    }
                  }}
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
          {!rooms.length && <p>Aucun local enregistré.</p>}
        </div>
      </div>

      {aircraftDraft && (
        <div className="modal-backdrop">
          <section className="modal compact">
            <header>
              <div>
                <h2>Avion</h2>
                <p>Fiche de la ressource</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setAircraftDraft(null)}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              <label>
                Immatriculation
                <input
                  value={aircraftDraft.registration}
                  onChange={event =>
                    setAircraftDraft({
                      ...aircraftDraft,
                      registration: event.target.value
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Fabricant
                  <input
                    value={aircraftDraft.manufacturer}
                    onChange={event =>
                      setAircraftDraft({
                        ...aircraftDraft,
                        manufacturer: event.target.value
                      })
                    }
                  />
                </label>
                <label>
                  Modèle
                  <input
                    value={aircraftDraft.model}
                    onChange={event =>
                      setAircraftDraft({
                        ...aircraftDraft,
                        model: event.target.value
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Type affiché
                <input
                  value={aircraftDraft.typeLabel}
                  onChange={event =>
                    setAircraftDraft({
                      ...aircraftDraft,
                      typeLabel: event.target.value
                    })
                  }
                  placeholder="Ex. Cessna 172"
                />
              </label>
            </div>
            <footer>
              <span />
              <button
                className="button secondary"
                onClick={() => setAircraftDraft(null)}
              >
                Annuler
              </button>
              <button className="button" onClick={saveAircraftDraft}>
                Enregistrer
              </button>
            </footer>
          </section>
        </div>
      )}

      {resourceDraft && (
        <div className="modal-backdrop">
          <section className="modal compact">
            <header>
              <div>
                <h2>{resourceDraft.resourceType}</h2>
                <p>Ressource de l’horaire</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setResourceDraft(null)}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              <label>
                Type
                <select
                  value={resourceDraft.resourceType}
                  onChange={event =>
                    setResourceDraft({
                      ...resourceDraft,
                      resourceType: event.target
                        .value as ManagedResource["resourceType"]
                    })
                  }
                >
                  <option>Simulateur</option>
                  <option>Local</option>
                </select>
              </label>
              <label>
                Nom
                <input
                  value={resourceDraft.name}
                  onChange={event =>
                    setResourceDraft({
                      ...resourceDraft,
                      name: event.target.value
                    })
                  }
                />
              </label>
              <label>
                Description
                <input
                  value={resourceDraft.detail}
                  onChange={event =>
                    setResourceDraft({
                      ...resourceDraft,
                      detail: event.target.value
                    })
                  }
                />
              </label>
            </div>
            <footer>
              <span />
              <button
                className="button secondary"
                onClick={() => setResourceDraft(null)}
              >
                Annuler
              </button>
              <button className="button" onClick={saveResourceDraft}>
                Enregistrer
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
