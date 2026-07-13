"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_RESOURCES } from "./data";
import { removeReservation, saveReservation, subscribeCancellations, subscribeReservations, subscribeResources, subscribeStudents, type StudentOption } from "./firestore";
import { ActivityType, Cancellation, SchedulerEvent, SchedulerResource } from "./types";

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_WIDTH = 96;
const SNAP = 30;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);
const TYPES: ActivityType[] = [
  "Double commande", "Solo", "Sol", "Simulateur", "Examen", "Maintenance", "Hors service"
];
const DELETE_REASONS = [
  "Météo", "Maintenance", "NOTAM", "Instructeur malade", "Élève malade",
  "Avion indisponible", "Conflit d’horaire", "Reporté", "Autre"
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snap(value: number) {
  return Math.round(value / SNAP) * SNAP;
}

function timeLabel(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function classFor(type: ActivityType) {
  if (type === "Solo") return "solo";
  if (type === "Maintenance") return "maintenance";
  if (type === "Hors service") return "out";
  if (type === "Sol") return "ground";
  if (type === "Simulateur") return "sim";
  if (type === "Examen") return "exam";
  return "dual";
}

function eventResourceIds(event: SchedulerEvent) {
  return [event.resourceId, event.aircraftId, event.instructorId, event.roomId].filter(Boolean);
}

function conflicts(candidate: SchedulerEvent, events: SchedulerEvent[]) {
  return events.some((item) => {
    if (item.id === candidate.id || item.date !== candidate.date) return false;
    const overlap = item.startMinutes < candidate.endMinutes && candidate.startMinutes < item.endMinutes;
    if (!overlap) return false;

    const sharedResource = eventResourceIds(candidate).some((id) => eventResourceIds(item).includes(id));
    const sharedStudent = Boolean(candidate.studentName && item.studentName &&
      candidate.studentName.trim().toLowerCase() === item.studentName.trim().toLowerCase());

    return sharedResource || sharedStudent;
  });
}

type Draft = {
  id?: string;
  resourceId: string;
  date: string;
  type: ActivityType;
  startMinutes: number;
  endMinutes: number;
  studentId: string;
  studentName: string;
  aircraftId: string;
  instructorId: string;
  roomId: string;
  title: string;
  notes: string;
};

export function SchedulerPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [ready, setReady] = useState(false);
  const [loadingParts, setLoadingParts] = useState({ resources: true, events: true, students: true, cancellations: true });
  const [firebaseError, setFirebaseError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteEvent, setDeleteEvent] = useState<SchedulerEvent | null>(null);
  const [deleteReason, setDeleteReason] = useState(DELETE_REASONS[0]);
  const [message, setMessage] = useState("");
  const [dragState, setDragState] = useState<{
    eventId: string;
    mode: "move" | "start" | "end";
    originalStart: number;
    originalEnd: number;
    originalResourceId: string;
  } | null>(null);

  useEffect(() => {
    const onError = (error: Error) => setFirebaseError(error.message || "Erreur Firestore.");
    const unsubscribeResources = subscribeResources({
      next: (items) => { setResources(items); setLoadingParts((current) => ({ ...current, resources: false })); },
      error: onError,
    });
    const unsubscribeEvents = subscribeReservations({
      next: (items) => { setEvents(items); setLoadingParts((current) => ({ ...current, events: false })); },
      error: onError,
    });
    const unsubscribeStudents = subscribeStudents({
      next: (items) => { setStudents(items); setLoadingParts((current) => ({ ...current, students: false })); },
      error: onError,
    });
    const unsubscribeCancellations = subscribeCancellations({
      next: (items) => { setCancellations(items); setLoadingParts((current) => ({ ...current, cancellations: false })); },
      error: onError,
    });
    return () => { unsubscribeResources(); unsubscribeEvents(); unsubscribeStudents(); unsubscribeCancellations(); };
  }, []);

  useEffect(() => {
    setReady(!Object.values(loadingParts).some(Boolean));
  }, [loadingParts]);

  const visibleEvents = useMemo(() => events.filter((event) => event.date === date), [events, date]);

  function openCreate(resource: SchedulerResource, clientX: number, rect: DOMRect) {
    const relative = clamp(clientX - rect.left, 0, (END_HOUR - START_HOUR) * HOUR_WIDTH);
    const startMinutes = snap(START_HOUR * 60 + (relative / HOUR_WIDTH) * 60);
    const defaultType: ActivityType =
      resource.kind === "aircraft" ? "Double commande" :
      resource.kind === "instructor" ? "Double commande" : "Sol";

    setDraft({
      resourceId: resource.id,
      date,
      type: defaultType,
      startMinutes,
      endMinutes: Math.min(startMinutes + 90, END_HOUR * 60),
      studentId: "",
      studentName: "",
      aircraftId: resource.kind === "aircraft" ? resource.id : "",
      instructorId: resource.kind === "instructor" ? resource.id : "",
      roomId: resource.kind === "room" ? resource.id : "",
      title: "",
      notes: ""
    });
  }

  function openEdit(event: SchedulerEvent) {
    setDraft({
      id: event.id,
      resourceId: event.resourceId,
      date: event.date,
      type: event.type,
      startMinutes: event.startMinutes,
      endMinutes: event.endMinutes,
      studentId: event.studentId || "",
      studentName: event.studentName || "",
      aircraftId: event.aircraftId || "",
      instructorId: event.instructorId || "",
      roomId: event.roomId || "",
      title: event.title,
      notes: event.notes || ""
    });
  }

  async function saveDraft() {
    if (!draft) return;
    if (draft.endMinutes <= draft.startMinutes) {
      setMessage("L’heure de fin doit être après l’heure de début.");
      return;
    }

    const candidate: SchedulerEvent = {
      id: draft.id || `event-${Date.now()}`,
      resourceId: draft.resourceId,
      date: draft.date,
      type: draft.type,
      startMinutes: draft.startMinutes,
      endMinutes: draft.endMinutes,
      studentId: draft.studentId || undefined,
      studentName: draft.studentName || undefined,
      aircraftId: draft.aircraftId || undefined,
      instructorId: draft.instructorId || undefined,
      roomId: draft.roomId || undefined,
      title: draft.title || draft.type,
      notes: draft.notes
    };

    if (conflicts(candidate, events)) {
      setMessage("Conflit détecté : la ressource ou la personne est déjà réservée.");
      return;
    }

    try {
      const exists = events.some((item) => item.id === candidate.id);
      await saveReservation(candidate, exists);
      setDraft(null);
      setMessage("Réservation enregistrée dans Firestore.");
    } catch (error) {
      setMessage(`Erreur Firestore : ${error instanceof Error ? error.message : "enregistrement impossible"}`);
    }
  }

  function beginDrag(event: SchedulerEvent, mode: "move" | "start" | "end") {
    setDragState({
      eventId: event.id,
      mode,
      originalStart: event.startMinutes,
      originalEnd: event.endMinutes,
      originalResourceId: event.resourceId
    });
  }

  async function finishDrag(resource: SchedulerResource, clientX: number, rect: DOMRect) {
    if (!dragState) return;
    const currentEvent = events.find((item) => item.id === dragState.eventId);
    if (!currentEvent) return;

    const relative = clamp(clientX - rect.left, 0, (END_HOUR - START_HOUR) * HOUR_WIDTH);
    const pointerMinutes = snap(START_HOUR * 60 + (relative / HOUR_WIDTH) * 60);
    const duration = dragState.originalEnd - dragState.originalStart;
    let next: SchedulerEvent = { ...currentEvent };

    if (dragState.mode === "move") {
      const startMinutes = clamp(pointerMinutes, START_HOUR * 60, END_HOUR * 60 - duration);
      next = {
        ...next,
        resourceId: resource.id,
        startMinutes,
        endMinutes: startMinutes + duration,
        aircraftId: resource.kind === "aircraft" ? resource.id : next.aircraftId,
        instructorId: resource.kind === "instructor" ? resource.id : next.instructorId,
        roomId: resource.kind === "room" ? resource.id : next.roomId
      };
    } else if (dragState.mode === "start") {
      next.startMinutes = Math.min(pointerMinutes, next.endMinutes - SNAP);
    } else {
      next.endMinutes = Math.max(pointerMinutes, next.startMinutes + SNAP);
    }

    if (conflicts(next, events)) {
      setMessage("Déplacement refusé : conflit de ressource ou de personne.");
    } else {
      try {
        await saveReservation(next, true);
        setMessage("Horaire modifié dans Firestore.");
      } catch (error) {
        setMessage(`Erreur Firestore : ${error instanceof Error ? error.message : "modification impossible"}`);
      }
    }
    setDragState(null);
  }

  async function confirmDelete() {
    if (!deleteEvent) return;
    try {
      await removeReservation(deleteEvent, deleteReason);
      setDeleteEvent(null);
      setMessage(`Réservation supprimée : ${deleteReason}.`);
    } catch (error) {
      setMessage(`Erreur Firestore : ${error instanceof Error ? error.message : "suppression impossible"}`);
    }
  }

  if (!ready) {
    return <><PageHeader title="Horaire" subtitle="Chargement du Scheduler Core…" /><section className="card">Chargement…</section></>;
  }

  return (
    <>
      <PageHeader title="Horaire" subtitle="Scheduler Firebase v15.2 · synchronisation en temps réel" />

      <div className="scheduler-toolbar">
        <button className="button secondary" onClick={() => setDate(new Date().toISOString().slice(0, 10))}>Aujourd’hui</button>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <span className="scheduler-help">Clic : créer · Glisser : déplacer · Poignées : redimensionner</span>
      </div>

      {firebaseError && <div className="notice error">Firestore : {firebaseError}</div>}
      {message && <div className={message.includes("Conflit") || message.includes("refusé") || message.includes("Erreur") ? "notice error" : "notice"}>{message}</div>}

      <section className="scheduler-shell">
        <div className="scheduler-scroll">
          <div className="scheduler-grid">
            <div className="resource-head">Ressources</div>
            {HOURS.map((hour) => <div className="hour-head" key={hour}>{String(hour).padStart(2, "0")}:00</div>)}

            {(resources.length ? resources : DEFAULT_RESOURCES).map((resource, index, allResources) => {
              const previous = allResources[index - 1];
              const showGroup = !previous || previous.kind !== resource.kind;
              const groupName = resource.kind === "aircraft" ? "AVIONS" : resource.kind === "instructor" ? "INSTRUCTEURS" : "LOCAUX";
              const rowEvents = visibleEvents.filter((event) => event.resourceId === resource.id);

              return (
                <div className="scheduler-row-wrapper" key={resource.id}>
                  {showGroup && <div className="resource-group">{groupName}</div>}
                  <div className="resource-cell">
                    <strong>{resource.name}</strong>
                    <span>{resource.detail}</span>
                  </div>
                  <div
                    className="time-row"
                    onClick={(mouseEvent) => {
                      if ((mouseEvent.target as HTMLElement).closest(".schedule-event")) return;
                      openCreate(resource, mouseEvent.clientX, mouseEvent.currentTarget.getBoundingClientRect());
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      finishDrag(resource, event.clientX, event.currentTarget.getBoundingClientRect());
                    }}
                  >
                    {HOURS.slice(0, -1).map((hour, hourIndex) => (
                      <div className="hour-cell" style={{ left: hourIndex * HOUR_WIDTH }} key={hour} />
                    ))}

                    {rowEvents.map((event) => {
                      const left = ((event.startMinutes - START_HOUR * 60) / 60) * HOUR_WIDTH;
                      const width = ((event.endMinutes - event.startMinutes) / 60) * HOUR_WIDTH;
                      return (
                        <div
                          className={`schedule-event ${classFor(event.type)}`}
                          draggable
                          onDragStart={() => beginDrag(event, "move")}
                          onDoubleClick={() => openEdit(event)}
                          style={{ left, width }}
                          key={event.id}
                        >
                          <button
                            className="resize-handle left"
                            draggable
                            onDragStart={(dragEvent) => {
                              dragEvent.stopPropagation();
                              beginDrag(event, "start");
                            }}
                            aria-label="Changer le début"
                          />
                          <div className="event-content" onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openEdit(event);
                          }}>
                            <strong>{timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}</strong>
                            <span>{event.type}</span>
                            <span>{event.studentName || event.title}</span>
                          </div>
                          <button
                            className="resize-handle right"
                            draggable
                            onDragStart={(dragEvent) => {
                              dragEvent.stopPropagation();
                              beginDrag(event, "end");
                            }}
                            aria-label="Changer la fin"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="card cancellation-card">
        <strong>Historique récent des annulations</strong>
        {cancellations.slice(0, 5).map((item) => (
          <div className="cancellation-row" key={item.id}>
            <span>{item.eventTitle}</span><span>{item.reason}</span>
          </div>
        ))}
        {!cancellations.length && <p>Aucune annulation.</p>}
      </section>

      {draft && (
        <div className="modal-backdrop">
          <section className="modal">
            <header><div><h2>{draft.id ? "Modifier la réservation" : "Nouvelle réservation"}</h2><p>{timeLabel(draft.startMinutes)} à {timeLabel(draft.endMinutes)}</p></div><button className="icon-button" onClick={() => setDraft(null)}>×</button></header>
            <div className="modal-body">
              <div className="form-grid">
                <label>Type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ActivityType })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
                <label>Début<input type="time" value={timeLabel(draft.startMinutes)} onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  setDraft({ ...draft, startMinutes: hours * 60 + minutes });
                }} /></label>
                <label>Fin<input type="time" value={timeLabel(draft.endMinutes)} onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  setDraft({ ...draft, endMinutes: hours * 60 + minutes });
                }} /></label>
                <label>Élève<select value={draft.studentId} onChange={(event) => { const student = students.find((item) => item.id === event.target.value); setDraft({ ...draft, studentId: event.target.value, studentName: student?.name || "" }); }}><option value="">Aucun</option>{students.map((student) => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label>
                <label>Avion<select value={draft.aircraftId} onChange={(event) => setDraft({ ...draft, aircraftId: event.target.value })}><option value="">Aucun</option>{(resources.length ? resources : DEFAULT_RESOURCES).filter((item) => item.kind === "aircraft").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>Instructeur<select value={draft.instructorId} onChange={(event) => setDraft({ ...draft, instructorId: event.target.value })}><option value="">Aucun</option>{(resources.length ? resources : DEFAULT_RESOURCES).filter((item) => item.kind === "instructor").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label>Local<select value={draft.roomId} onChange={(event) => setDraft({ ...draft, roomId: event.target.value })}><option value="">Aucun</option>{(resources.length ? resources : DEFAULT_RESOURCES).filter((item) => item.kind === "room").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              </div>
              <label>Titre<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            </div>
            <footer>
              {draft.id && <button className="button danger" onClick={() => {
                const current = events.find((item) => item.id === draft.id);
                if (current) setDeleteEvent(current);
                setDraft(null);
              }}>Supprimer</button>}
              <span />
              <button className="button secondary" onClick={() => setDraft(null)}>Annuler</button>
              <button className="button" onClick={saveDraft}>Enregistrer</button>
            </footer>
          </section>
        </div>
      )}

      {deleteEvent && (
        <div className="modal-backdrop">
          <section className="modal compact">
            <header><div><h2>Supprimer la réservation</h2><p>{deleteEvent.title}</p></div></header>
            <div className="modal-body">
              <label>Raison<select value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)}>{DELETE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
            </div>
            <footer>
              <span />
              <button className="button secondary" onClick={() => setDeleteEvent(null)}>Annuler</button>
              <button className="button danger" onClick={confirmDelete}>Confirmer la suppression</button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
