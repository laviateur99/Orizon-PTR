"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  changeMaintenanceWorkOrderStatus,
  createMaintenanceWorkOrder,
  restoreMaintenanceSchedulerHistory,
  subscribeMaintenanceWorkOrders,
  subscribeSnags,
  updateMaintenanceWorkOrder,
} from "@/features/fleet/firestore";
import type {
  Aircraft,
  MaintenancePriority,
  MaintenanceTask,
  MaintenanceWorkOrder,
  MaintenanceWorkSource,
  MaintenanceWorkStatus,
  Snag,
} from "@/features/fleet/types";
import {
  firestoreDateTimeToLocalInput,
  formatQuebecDateTime,
  quebecLocalInputToIso,
} from "@/lib/quebecDateTime";

const STATUSES: MaintenanceWorkStatus[] = [
  "Planifiée",
  "Assignée",
  "En cours",
  "Travail terminé",
  "En attente de pièces",
  "Suspendue",
  "Inspection requise",
  "Inspection complétée",
  "Retour en service refusé",
  "Autorisée pour retour en service",
  "Fermée",
  "Annulée",
];
const SOURCES: MaintenanceWorkSource[] = [
  "Échéance maintenance existante",
  "SNAG",
  "Intervention manuelle",
];
const PRIORITIES: MaintenancePriority[] = [
  "Critique",
  "Haute",
  "Normale",
  "Basse",
];
const RTS_CONTROLLED_STATUSES = new Set<MaintenanceWorkStatus>([
  "Travail terminé",
  "Inspection requise",
  "Inspection complétée",
  "Retour en service refusé",
  "Autorisée pour retour en service",
  "Fermée",
]);
const rank: Record<MaintenancePriority, number> = {
  Critique: 0,
  Urgente: 0,
  Haute: 1,
  Surveillance: 1,
  Normale: 2,
  Basse: 3,
};
const saveWithTimeout = async (operation: Promise<void>) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Firestore ne répond pas. Vérifiez la connexion, puis réessayez.",
              ),
            ),
          20000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
const transitions: Record<MaintenanceWorkStatus, MaintenanceWorkStatus[]> = {
  Planifiée: ["Planifiée", "Assignée", "Annulée"],
  Assignée: ["Assignée", "En cours", "Suspendue", "Annulée"],
  "En cours": [
    "En cours",
    "En attente de pièces",
    "Suspendue",
    "Travail terminé",
    "Inspection requise",
    "Annulée",
  ],
  "Travail terminé": [
    "Travail terminé",
    "Inspection requise",
    "Autorisée pour retour en service",
    "En cours",
    "Annulée",
  ],
  "En attente de pièces": [
    "En attente de pièces",
    "En cours",
    "Suspendue",
    "Annulée",
  ],
  Suspendue: ["Suspendue", "Assignée", "En cours", "Annulée"],
  "Inspection requise": [
    "Inspection requise",
    "Inspection complétée",
    "Retour en service refusé",
  ],
  "Inspection complétée": [
    "Inspection complétée",
    "Autorisée pour retour en service",
    "Retour en service refusé",
  ],
  "Retour en service refusé": [
    "Retour en service refusé",
    "En cours",
    "Inspection requise",
    "Annulée",
  ],
  "Autorisée pour retour en service": [
    "Autorisée pour retour en service",
    "Fermée",
    "Retour en service refusé",
  ],
  Fermée: ["Fermée"],
  Annulée: ["Annulée"],
};

export function MaintenanceWorkOrdersPanel({
  aircraft,
  tasks,
  actor,
}: {
  aircraft: Aircraft[];
  tasks: MaintenanceTask[];
  actor: { id: string; name: string; role: string };
}) {
  const [orders, setOrders] = useState<MaintenanceWorkOrder[]>([]),
    [snags, setSnags] = useState<Snag[]>([]),
    [editing, setEditing] = useState<MaintenanceWorkOrder | null>(null),
    [original, setOriginal] = useState<MaintenanceWorkOrder | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [statusFilter, setStatusFilter] = useState<
      MaintenanceWorkStatus | "Actifs" | "Tous"
    >("Actifs"),
    [aircraftFilter, setAircraftFilter] = useState("Tous");
  const manager =
    actor.role === "Administrateur" ||
    actor.role === "Directeur de maintenance";
  const canApproveRts = manager || actor.role === "Maintenance";
  const restoredSchedulerHistory = useRef(new Set<string>());
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    const a = subscribeMaintenanceWorkOrders({
        next: (items) => {
          setOrders(items);
          if (!canApproveRts) return;
          for (const item of items) {
            if (
              !item.schedulerReservationId ||
              !["Autorisée pour retour en service", "Fermée"].includes(
                item.workStatus,
              ) ||
              restoredSchedulerHistory.current.has(item.id)
            )
              continue;
            restoredSchedulerHistory.current.add(item.id);
            void restoreMaintenanceSchedulerHistory(item, actor).catch(
              (value: unknown) => {
                restoredSchedulerHistory.current.delete(item.id);
                setError(
                  value instanceof Error
                    ? value.message
                    : "La restauration du créneau historique a échoué.",
                );
              },
            );
          }
        },
        error: (value) => setError(value.message),
      }),
      b = subscribeSnags({
        next: setSnags,
        error: (value) => setError(value.message),
      });
    return () => {
      a();
      b();
    };
  }, []);
  useEffect(() => {
    if (deepLinkHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search),
      workOrderId = params.get("workOrderId"),
      snagId = params.get("snagId");
    if (workOrderId) {
      const order = orders.find((item) => item.id === workOrderId);
      if (!order) return;
      deepLinkHandled.current = true;
      setOriginal(order);
      setEditing(order);
      setReason("");
      setError("");
      return;
    }
    if (snagId) {
      const snag = snags.find((item) => item.id === snagId);
      if (!snag || !aircraft.length) return;
      if (snag.workOrderId) {
        const order = orders.find((item) => item.id === snag.workOrderId);
        if (!order) return;
        deepLinkHandled.current = true;
        setOriginal(order);
        setEditing(order);
        setReason("");
        setError("");
        return;
      }
      deepLinkHandled.current = true;
      beginNew(snag);
    }
  }, [aircraft, orders, snags]);
  const visible = useMemo(
    () =>
      orders
        .filter(
          (item) =>
            (statusFilter === "Tous" ||
              (statusFilter === "Actifs"
                ? item.workStatus !== "Fermée"
                : item.workStatus === statusFilter)) &&
            (aircraftFilter === "Tous" || item.aircraftId === aircraftFilter),
        )
        .sort(
          (a, b) =>
            rank[a.priority] - rank[b.priority] ||
            (a.plannedStartAt || "9999").localeCompare(
              b.plannedStartAt || "9999",
            ),
        ),
    [orders, statusFilter, aircraftFilter],
  );
  const pendingSnags = useMemo(
    () =>
      snags
        .filter((item) => item.status !== "Fermé" && !item.workOrderId)
        .sort((a, b) => {
          const severity = (value: Snag["severity"]) =>
            value === "Critique (AOG)"
              ? 0
              : value === "Avant prochain vol"
                ? 1
                : value === "À surveiller"
                  ? 2
                  : 3;
          return severity(a.severity) - severity(b.severity);
        }),
    [snags],
  );
  function beginNew(snag?: Snag) {
    const plane = snag
      ? aircraft.find((item) => item.id === snag.aircraftId)
      : aircraft.find((item) => item.active) || aircraft[0];
    if (!plane) return;
    const now = new Date().toISOString();
    setOriginal(null);
    setReason("");
    setError("");
    setEditing({
      id: `work-${crypto.randomUUID()}`,
      aircraftId: plane.id,
      aircraftRegistration: plane.registration,
      aircraftType: plane.typeLabel,
      snagId: snag?.id,
      title: snag?.defectTitle || "",
      description: snag?.description || "",
      source: snag ? "SNAG" : "Intervention manuelle",
      priority:
        snag?.severity === "Critique (AOG)" ||
        snag?.severity === "Avant prochain vol"
          ? "Critique"
          : "Normale",
      workStatus: "Planifiée",
      prm:
        actor.role === "Maintenance"
          ? { uid: actor.id, name: actor.name }
          : { uid: "", name: "" },
      dom:
        actor.role === "Directeur de maintenance"
          ? { uid: actor.id, name: actor.name }
          : { uid: "", name: "" },
      technician: { uid: "", name: "" },
      createdBy: { uid: actor.id, name: actor.name, role: actor.role },
      createdAt: now,
      updatedAt: now,
      documents: [],
    });
  }
  function selectAircraft(id: string) {
    if (!editing) return;
    const plane = aircraft.find((item) => item.id === id);
    if (plane)
      setEditing({
        ...editing,
        aircraftId: plane.id,
        aircraftRegistration: plane.registration,
        aircraftType: plane.typeLabel,
        maintenanceTaskId: undefined,
        snagId: undefined,
        dueAirTime: undefined,
        dueDate: undefined,
      });
  }
  function selectTask(id: string) {
    if (!editing) return;
    const task = tasks.find((item) => item.id === id);
    setEditing({
      ...editing,
      maintenanceTaskId: id || undefined,
      title: task?.title || editing.title,
      dueAirTime: task?.dueAirTime,
      dueDate: task?.dueDate,
    });
  }
  function selectSnag(id: string) {
    if (!editing) return;
    const snag = snags.find((item) => item.id === id);
    setEditing({
      ...editing,
      snagId: id || undefined,
      title: snag?.defectTitle || editing.title,
      description: snag?.description || editing.description,
    });
  }
  function allowed(status: MaintenanceWorkStatus) {
    if (!editing) return false;
    if (!original) return status === "Planifiée";
    if (!transitions[original.workStatus].includes(status)) return false;
    return (
      ![
        "Inspection complétée",
        "Autorisée pour retour en service",
        "Fermée",
      ].includes(status) || manager
    );
  }
  async function save(candidate: MaintenanceWorkOrder | null = editing) {
    if (!candidate || saving) return;
    if (!candidate.aircraftId || !candidate.title.trim()) {
      setError("L’avion et le titre du travail sont obligatoires.");
      return;
    }
    if (!reason.trim()) {
      setError("La raison du changement est obligatoire.");
      return;
    }
    if (
      candidate.workStatus === "Assignée" &&
      !candidate.prm?.name &&
      !candidate.dom?.name &&
      !candidate.technician?.name
    ) {
      setError("Assignez au moins un responsable.");
      return;
    }
    if (
      candidate.plannedStartAt &&
      candidate.plannedEndAt &&
      candidate.plannedEndAt <= candidate.plannedStartAt
    ) {
      setError("La fin prévue doit être après le début prévu.");
      return;
    }
    if (
      original &&
      original.workStatus !== candidate.workStatus &&
      !transitions[original.workStatus].includes(candidate.workStatus)
    ) {
      setError("Cette transition de statut n’est pas autorisée.");
      return;
    }
    if (
      ["Travail terminé", "Inspection requise"].includes(
        candidate.workStatus,
      ) &&
      !candidate.workCompletedBy
    ) {
      setError("Le technicien doit confirmer que le travail est terminé.");
      return;
    }
    if (
      candidate.workStatus === "Inspection complétée" &&
      (!candidate.inspectionPerformedBy ||
        candidate.inspectionResult !== "Accepté")
    ) {
      setError("L’inspection doit être effectuée et acceptée.");
      return;
    }
    if (
      candidate.workStatus === "Autorisée pour retour en service" &&
      (!canApproveRts || !candidate.rtsAuthorizedBy)
    ) {
      setError("Seul un PRM, un DOM ou un administrateur peut autoriser le RTS.");
      return;
    }
    const now = new Date().toISOString(),
      next = {
        ...candidate,
        assignedAt:
          candidate.assignedAt ||
          (candidate.workStatus === "Assignée" ? now : undefined),
        actualStartAt:
          candidate.actualStartAt ||
          (candidate.workStatus === "En cours" ? now : undefined),
        inspectionCompletedAt:
          candidate.inspectionCompletedAt ||
          (candidate.workStatus === "Inspection complétée" ? now : undefined),
        approvedForReturnAt:
          candidate.approvedForReturnAt ||
          (candidate.workStatus === "Autorisée pour retour en service"
            ? now
            : undefined),
        closedAt:
          candidate.closedAt ||
          (candidate.workStatus === "Fermée" ? now : undefined),
      };
    setSaving(true);
    setError("");
    try {
      if (!original)
        await saveWithTimeout(createMaintenanceWorkOrder(next, actor, reason));
      else if (original.workStatus !== next.workStatus)
        await saveWithTimeout(
          changeMaintenanceWorkOrderStatus(next, actor, reason, original),
        );
      else
        await saveWithTimeout(
          updateMaintenanceWorkOrder(next, actor, reason, original),
        );
      setEditing(null);
      setOriginal(null);
      setReason("");
    } catch (value) {
      const detail =
        value instanceof Error ? value.message : "Enregistrement impossible.";
      setError(detail);
      window.alert(`Retour en service impossible : ${detail}`);
    } finally {
      setSaving(false);
    }
  }
  const due = (order: MaintenanceWorkOrder) =>
    [
      order.dueAirTime !== undefined ? `${order.dueAirTime.toFixed(1)} h` : "",
      order.dueDate || "",
    ]
      .filter(Boolean)
      .join(" / ") || "—";
  const auditActor = () => ({
    uid: actor.id,
    name: actor.name,
    role: actor.role,
    at: new Date().toISOString(),
  });
  return (
    <section className="card maintenance-work-orders">
      <header>
        <div>
          <h2>Suivi des travaux PRM / DOM</h2>
          <p>Ordres opérationnels distincts du référentiel réglementaire.</p>
        </div>
        <button className="button" onClick={() => beginNew()}>
          Créer un travail de maintenance
        </button>
      </header>
      {pendingSnags.length > 0 && (
        <section className="maintenance-snag-queue">
          <div>
            <h3>SNAG à traiter</h3>
            <p>
              Créez un ordre de travail pour démarrer le processus de
              réparation et de retour en service MCM.
            </p>
          </div>
          <div className="maintenance-snag-list">
            {pendingSnags.map((snag) => (
              <article key={snag.id}>
                <span>
                  <strong>
                    {snag.aircraftRegistration} · {snag.snagNumber || "SNAG"}
                  </strong>
                  <small>
                    {snag.defectTitle} · {snag.severity}
                  </small>
                </span>
                <button
                  className="button small"
                  onClick={() => beginNew(snag)}
                >
                  Créer le travail
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="maintenance-work-filters">
        <label>
          Statut
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | MaintenanceWorkStatus
                  | "Actifs"
                  | "Tous",
              )
            }
          >
            <option>Actifs</option>
            <option>Tous</option>
            {STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Avion
          <select
            value={aircraftFilter}
            onChange={(event) => setAircraftFilter(event.target.value)}
          >
            <option value="Tous">Tous</option>
            {aircraft
              .filter((item) => item.active)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.registration}
                </option>
              ))}
          </select>
        </label>
        <span>Tri : priorité critique en premier</span>
      </div>
      {error && !editing && <div className="notice error">{error}</div>}
      <div className="maintenance-work-table-wrap">
        <table className="maintenance-work-table">
          <thead>
            <tr>
              <th>Avion</th>
              <th>Type</th>
              <th>Travail</th>
              <th>Échéance liée</th>
              <th>PRM</th>
              <th>DOM</th>
              <th>Technicien</th>
              <th>Contrôle</th>
              <th>RTS autorisé par</th>
              <th>Statut</th>
              <th>Début prévu</th>
              <th>Fin prévue</th>
              <th>Horaire</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order) => (
              <tr
                className={`priority-${order.priority.toLocaleLowerCase("fr-CA")}`}
                key={order.id}
              >
                <td>
                  <b>{order.aircraftRegistration}</b>
                </td>
                <td>{order.aircraftType}</td>
                <td>
                  <b>{order.title}</b>
                  <small>
                    {order.priority} · {order.source}
                  </small>
                </td>
                <td>{due(order)}</td>
                <td>{order.prm?.name || "—"}</td>
                <td>{order.dom?.name || "—"}</td>
                <td>{order.technician?.name || "—"}</td>
                <td>{order.inspectionPerformedBy?.name || "—"}</td>
                <td>{order.rtsAuthorizedBy?.name || "—"}</td>
                <td>
                  <span className="badge">{order.workStatus}</span>
                </td>
                <td>
                  {formatQuebecDateTime(order.plannedStartAt)}
                </td>
                <td>
                  {formatQuebecDateTime(order.plannedEndAt)}
                </td>
                <td>
                  {order.schedulerReservationId && order.plannedStartAt ? (
                    <a
                      className="maintenance-schedule-link"
                      href={`/schedule?date=${firestoreDateTimeToLocalInput(order.plannedStartAt).slice(0, 10)}&reservation=${encodeURIComponent(order.schedulerReservationId)}`}
                    >
                      🟧 Créneau réservé dans Scheduler
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      setOriginal(order);
                      setEditing({ ...order });
                      setReason("");
                      setError("");
                    }}
                  >
                    Ouvrir
                  </button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={12}>Aucun travail correspondant.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-backdrop maintenance-work-backdrop">
          <section className="modal maintenance-work-modal">
            <header>
              <div>
                <h2>
                  {original
                    ? "Ordre de travail"
                    : "Nouveau travail de maintenance"}
                </h2>
                <p>
                  {editing.aircraftRegistration} ·{" "}
                  {editing.title || "Sans titre"}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setEditing(null);
                  setError("");
                }}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              {error && (
                <div className="notice error" role="alert">
                  {error}
                </div>
              )}
              <div className="form-grid">
                <label>
                  Avion
                  <select
                    disabled={Boolean(original)}
                    value={editing.aircraftId}
                    onChange={(event) => selectAircraft(event.target.value)}
                  >
                    {aircraft
                      .filter((item) => item.active)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.registration} · {item.typeLabel}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Source
                  <select
                    value={editing.source}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        source: event.target.value as MaintenanceWorkSource,
                        maintenanceTaskId: undefined,
                        snagId: undefined,
                      })
                    }
                  >
                    {SOURCES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              {editing.source === "Échéance maintenance existante" && (
                <label>
                  Échéance liée
                  <select
                    value={editing.maintenanceTaskId || ""}
                    onChange={(event) => selectTask(event.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {tasks
                      .filter(
                        (item) =>
                          item.aircraftId === editing.aircraftId &&
                          !item.completed,
                      )
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {editing.source === "SNAG" && (
                <label>
                  SNAG lié
                  <select
                    value={editing.snagId || ""}
                    onChange={(event) => selectSnag(event.target.value)}
                  >
                    <option value="">Sélectionner</option>
                    {snags
                      .filter(
                        (item) =>
                          item.aircraftId === editing.aircraftId &&
                          item.status !== "Fermé" &&
                          (!item.workOrderId ||
                            item.workOrderId === editing.id),
                      )
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.snagNumber} · {item.defectTitle}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Travail
                <input
                  value={editing.title}
                  onChange={(event) =>
                    setEditing({ ...editing, title: event.target.value })
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={editing.description || ""}
                  onChange={(event) =>
                    setEditing({ ...editing, description: event.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Priorité
                  <select
                    value={editing.priority}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        priority: event.target.value as MaintenancePriority,
                      })
                    }
                  >
                    {PRIORITIES.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Statut
                  <select
                    value={editing.workStatus}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        workStatus: event.target.value as MaintenanceWorkStatus,
                      })
                    }
                  >
                    {STATUSES.map((status) => (
                      <option
                        disabled={
                          !allowed(status) ||
                          (RTS_CONTROLLED_STATUSES.has(status) &&
                            status !== editing.workStatus)
                        }
                        key={status}
                      >
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  PRM
                  <input
                    value={editing.prm?.name || ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        prm: {
                          uid: editing.prm?.uid || "",
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  DOM
                  <input
                    value={editing.dom?.name || ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        dom: {
                          uid: editing.dom?.uid || "",
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Technicien
                  <input
                    value={editing.technician?.name || ""}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        technician: {
                          uid: editing.technician?.uid || "",
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Début prévu
                  <input
                    type="datetime-local"
                    step="300"
                    value={firestoreDateTimeToLocalInput(editing.plannedStartAt)}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        plannedStartAt:
                          quebecLocalInputToIso(event.target.value) || undefined,
                      })
                    }
                  />
                </label>
                <label>
                  Fin prévue
                  <input
                    type="datetime-local"
                    step="300"
                    value={firestoreDateTimeToLocalInput(editing.plannedEndAt)}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        plannedEndAt:
                          quebecLocalInputToIso(event.target.value) || undefined,
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Commentaires
                <textarea
                  rows={3}
                  value={editing.followUpComments || ""}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      followUpComments: event.target.value,
                    })
                  }
                />
              </label>
              <section className="maintenance-rts-section">
                <h3>Validation retour en service</h3>
                <div className="form-grid">
                  <label>
                    Travail complété par
                    <input
                      readOnly
                      value={editing.workCompletedBy?.name || "—"}
                    />
                    <small>
                      {editing.workCompletedBy
                        ? `${editing.workCompletedBy.role} · ${formatQuebecDateTime(editing.workCompletedAt || editing.workCompletedBy.at)}`
                        : "En attente de confirmation"}
                    </small>
                  </label>
                  <label className="maintenance-rts-check">
                    <input
                      type="checkbox"
                      disabled={Boolean(editing.workCompletedBy)}
                      checked={editing.inspectionRequired === true}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          inspectionRequired: event.target.checked,
                        })
                      }
                    />
                    Inspection / contrôle qualité requis
                  </label>
                  <label>
                    Inspection effectuée par — signature automatique
                    <input
                      readOnly
                      value={editing.inspectionPerformedBy?.name || "—"}
                    />
                    <small>Résultat : {editing.inspectionResult || "—"}</small>
                  </label>
                  <label>
                    Autorisation retour service — signature automatique
                    <input
                      readOnly
                      value={editing.rtsAuthorizedBy?.name || "—"}
                    />
                    <small>
                      {editing.returnedToServiceAt
                        ? formatQuebecDateTime(editing.returnedToServiceAt)
                        : "En attente"}
                    </small>
                  </label>
                </div>
                {editing.inspectionRequired === true &&
                  editing.workCompletedBy?.uid === actor.id &&
                  actor.role !== "Administrateur" && (
                    <div className="notice warning" role="status">
                      Vous avez complété ce travail. Une autre personne autorisée
                      doit se connecter pour effectuer le contrôle qualité.
                    </div>
                  )}
                <label>
                  Commentaires RTS
                  <textarea
                    rows={3}
                    value={editing.rtsComments || ""}
                    onChange={(event) =>
                      setEditing({ ...editing, rtsComments: event.target.value })
                    }
                  />
                </label>
              </section>
              <label>
                Raison obligatoire
                <textarea
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
            </div>
            {error && (
              <div className="notice error maintenance-work-footer-error" role="alert">
                {error}
              </div>
            )}
            <footer>
              {original?.workStatus === "En cours" && (
                <button
                  className="button rts-action"
                  disabled={saving}
                  onClick={() => {
                    const completedAt = new Date().toISOString();
                    void save({
                      ...editing,
                      workStatus: editing.inspectionRequired
                        ? "Inspection requise"
                        : "Travail terminé",
                      workCompletedBy: { ...auditActor(), at: completedAt },
                      workCompletedAt: completedAt,
                    });
                  }}
                >
                  🟢 Demander retour en service
                </button>
              )}
              {original?.workStatus === "Inspection requise" &&
                canApproveRts && (
                  <>
                    <button
                      className="button danger"
                      disabled={
                        saving ||
                        (editing.workCompletedBy?.uid === actor.id &&
                          actor.role !== "Administrateur")
                      }
                      title={
                        editing.workCompletedBy?.uid === actor.id &&
                        actor.role !== "Administrateur"
                          ? "Le technicien ne peut pas contrôler son propre travail."
                          : ""
                      }
                      onClick={() =>
                        void save({
                          ...editing,
                          workStatus: "Retour en service refusé",
                          inspectionPerformedBy: auditActor(),
                          inspectionResult: "Refusé",
                        })
                      }
                    >
                      Refuser l’inspection
                    </button>
                    <button
                      className="button rts-action"
                      disabled={
                        saving ||
                        (editing.workCompletedBy?.uid === actor.id &&
                          actor.role !== "Administrateur")
                      }
                      title={
                        editing.workCompletedBy?.uid === actor.id &&
                        actor.role !== "Administrateur"
                          ? "Le technicien ne peut pas inspecter son propre travail."
                          : ""
                      }
                      onClick={() =>
                        void save({
                          ...editing,
                          workStatus: "Inspection complétée",
                          inspectionPerformedBy: auditActor(),
                          inspectionResult: "Accepté",
                        })
                      }
                    >
                      Valider l’inspection
                    </button>
                  </>
                )}
              {(original?.workStatus === "Travail terminé" ||
                original?.workStatus === "Inspection complétée") &&
                canApproveRts && (
                  <button
                    className="button rts-action"
                    disabled={
                      saving ||
                      (editing.inspectionRequired === true &&
                        editing.workCompletedBy?.uid === actor.id &&
                        actor.role !== "Administrateur")
                    }
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Autoriser officiellement le retour en service de ${editing.aircraftRegistration} pour « ${editing.title} »?`,
                        )
                      )
                        return;
                      const returnedAt = new Date().toISOString();
                      void save({
                        ...editing,
                        workStatus: "Autorisée pour retour en service",
                        rtsAuthorizedBy: { ...auditActor(), at: returnedAt },
                        returnedToServiceAt: returnedAt,
                      });
                    }}
                  >
                    🟢 Autoriser retour en service
                  </button>
                )}
              {original?.workStatus ===
                "Autorisée pour retour en service" &&
                canApproveRts && (
                  <button
                    className="button rts-action"
                    disabled={saving}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Fermer définitivement l’ordre « ${editing.title} »? L’historique restera conservé.`,
                        )
                      )
                        return;
                      void save({ ...editing, workStatus: "Fermée" });
                    }}
                  >
                    Fermer l’ordre
                  </button>
                )}
              <span />
              <button
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Annuler
              </button>
              <button
                className="button"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
