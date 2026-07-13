"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createWithGeneratedId, useFlightDirectorData } from "@/lib/liveData";
import { Reservation } from "@/lib/types";
import { getUnavailabilityConflict } from "@/lib/availability";

const ACTIVITY_TYPES = [
  "Double commande",
  "Solo",
  "Maintenance",
  "Hors service",
  "Inspection 50 h",
  "Inspection 100 h",
  "Inspection annuelle",
  "Bris mécanique",
  "Nettoyage",
  "Réservé école",
  "Sol",
  "Simulateur",
  "Examen",
] as const;

const NON_FLIGHT_TYPES = [
  "Maintenance",
  "Hors service",
  "Inspection 50 h",
  "Inspection 100 h",
  "Inspection annuelle",
  "Bris mécanique",
  "Nettoyage",
  "Réservé école",
] as const;

function isNonFlightActivity(type: string) {
  return (NON_FLIGHT_TYPES as readonly string[]).includes(type);
}

function conflict(candidate: Omit<Reservation, "id">, reservations: Reservation[]) {
  return reservations.find((r) => {
    if (r.date !== candidate.date || r.status === "Annulé") return false;
    const overlap = r.startTime < candidate.endTime && candidate.startTime < r.endTime;
    if (!overlap) return false;
    if (isNonFlightActivity(candidate.type)) {
      return r.aircraftId === candidate.aircraftId;
    }

    return (
      r.aircraftId === candidate.aircraftId ||
      r.studentId === candidate.studentId ||
      (!!candidate.instructorId && r.instructorId === candidate.instructorId)
    );
  });
}

export default function NewReservation() {
  const router = useRouter();
  const search = useSearchParams();
  const data = useFlightDirectorData();

  const students = data.students.items;
  const instructors = data.instructors.items;
  const aircraft = data.aircraft.items;

  const [error, setError] = useState("");
  const [form, setForm] = useState({
    date: search.get("date") || new Date().toISOString().slice(0, 10),
    startTime: search.get("time") || "09:00",
    endTime: "10:30",
    studentId: search.get("student") || "",
    instructorId: search.get("instructor") || "",
    aircraftId: search.get("aircraft") || "",
    type: "Double commande" as "Double commande" | "Solo" | "Maintenance" | "Hors service" | "Inspection 50 h" | "Inspection 100 h" | "Inspection annuelle" | "Bris mécanique" | "Nettoyage" | "Réservé école" | "Sol" | "Simulateur" | "Examen",
    lesson: "",
    status: "Planifié" as "Planifié" | "Confirmé" | "Complété" | "Annulé",
    notes: "",
  });

  function update(field: string, value: any) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const studentId = form.studentId || students[0]?.id || "";
    const aircraftId = form.aircraftId || aircraft.find((item) => item.status === "Disponible")?.id || aircraft[0]?.id || "";
    const instructorId = form.type === "Solo" || isNonFlightActivity(form.type) ? "" : form.instructorId || instructors[0]?.id || "";

    const candidate = {
      ...form,
      studentId,
      aircraftId,
      instructorId,
    };

    const existing = conflict(candidate, data.reservations.items);
    if (existing) {
      setError("Conflit : cette réservation chevauche déjà un avion, un instructeur ou un élève.");
      return;
    }

    const unavailable = getUnavailabilityConflict(candidate, data.unavailabilities.items);
    if (unavailable) {
      setError(`Ressource indisponible : ${unavailable.reason} du ${unavailable.startDate} ${unavailable.startTime} au ${unavailable.endDate} ${unavailable.endTime}.`);
      return;
    }

    const plane = data.aircraftMap[aircraftId];
    if (plane && plane.status !== "Disponible" && form.type !== "Maintenance") {
      setError("Cet avion n'est pas disponible.");
      return;
    }

    try {
      setError("");
      await createWithGeneratedId(
        "reservations",
        candidate,
        `reservation-${form.date}-${form.startTime}`
      );
      router.push("/schedule");
    } catch (err: any) {
      setError(err.message || "Impossible de créer la réservation.");
    }
  }

  return (
    <AppShell>
      <div className="header">
        <div>
          <h1>Nouvelle réservation</h1>
          <div className="subtitle">Module horaire · conflit vérifié avant enregistrement</div>
        </div>
      </div>

      <form className="card panel form" onSubmit={submit}>
        {error && <div className="conflict-box">{error}</div>}

        <div className="formgrid">
          <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
          <select value={form.type} onChange={(e) => update("type", e.target.value)}>
            {ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>

        <div className="formgrid">
          <input type="time" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
          <input type="time" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
        </div>

        <div className="formgrid">
          <select value={form.studentId} onChange={(e) => update("studentId", e.target.value)}>
            <option value="">Choisir un étudiant</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
            ))}
          </select>

          <select value={form.instructorId} onChange={(e) => update("instructorId", e.target.value)}>
            <option value="">Aucun instructeur</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>{instructor.firstName} {instructor.lastName}</option>
            ))}
          </select>
        </div>

        <select value={form.aircraftId} onChange={(e) => update("aircraftId", e.target.value)}>
          <option value="">Choisir un avion</option>
          {aircraft.map((plane) => (
            <option key={plane.id} value={plane.id}>{plane.registration} · {plane.type} · {plane.status}</option>
          ))}
        </select>

        <input placeholder="Leçon / objectif" value={form.lesson} onChange={(e) => update("lesson", e.target.value)} />
        <textarea placeholder="Notes de réservation" value={form.notes} onChange={(e) => update("notes", e.target.value)} />

        <button className="button">Créer la réservation</button>
      </form>
    </AppShell>
  );
}
