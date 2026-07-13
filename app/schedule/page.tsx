"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { createWithGeneratedId, useFlightDirectorData } from "@/lib/liveData";
import { deleteDocument, updateDocument } from "@/lib/firestore";
import { Aircraft, Instructor, Reservation, ResourceUnavailability, Student } from "@/lib/types";

const HOURS = [
  "07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00",
  "15:00","16:00","17:00","18:00","19:00","20:00","21:00"
];

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

const AIRCRAFT_ONLY_TYPES = [
  "Maintenance",
  "Hors service",
  "Inspection 50 h",
  "Inspection 100 h",
  "Inspection annuelle",
  "Bris mécanique",
  "Nettoyage",
  "Réservé école",
] as const;



const CANCEL_REASONS = [
  "Météo",
  "Maintenance",
  "NOTAM",
  "Instructeur malade",
  "Élève malade",
  "Avion indisponible",
  "Conflit d’horaire",
  "Reporté",
  "Autre",
] as const;

const SCHOOL_ROOMS = [
  { id: "salle-classe", name: "Salle de classe", detail: "Théorie / sol" },
  { id: "salle-examen", name: "Salle examen", detail: "Examens" },
  { id: "salle-briefing", name: "Salle de briefing", detail: "Briefing / debriefing" },
  { id: "salle-conference", name: "Salle de conférence", detail: "Réunion / formation" },
  { id: "local-merici", name: "Local Mérici", detail: "Local externe" },
];

function isRoomActivity(type: string) {
  return type === "Sol" || type === "Simulateur" || type === "Examen";
}

function isAircraftOnly(type: string) {
  return (AIRCRAFT_ONLY_TYPES as readonly string[]).includes(type);
}

function aircraftStatusForActivity(type: string) {
  if (type === "Hors service" || type === "Bris mécanique") return "Hors service";
  if (isAircraftOnly(type)) return "Maintenance";
  return undefined;
}

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toTime(mins: number) {
  const clamped = Math.max(minutes("06:00"), Math.min(minutes("23:30"), mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function roundToHalfHour(mins: number) {
  return Math.round(mins / 30) * 30;
}

function addDays(date: string, delta: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function eventStyle(event: UnifiedEvent) {
  const start = minutes(event.startTime);
  const end = minutes(event.endTime);
  const dayStart = minutes("07:00");
  const width = Math.max(40, ((end - start) / 60) * 96 - 8);
  const left = ((start - dayStart) / 60) * 96 + 4;
  return { left, width };
}

function eventClass(type: string) {
  if (type === "Solo") return "solo";
  if (type === "Hors service" || type === "Bris mécanique") return "outofservice";
  if (type.includes("Inspection")) return "inspection";
  if (type === "Réservé école" || type === "Nettoyage") return "reserved";
  if (type === "Maintenance") return "maintenance";
  if (isRoomActivity(type)) return "room";
  return "dual";
}

function nowPosition() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = minutes("07:00");
  const end = minutes("21:00");
  if (mins < start || mins > end) return null;
  return 160 + ((mins - start) / 60) * 96;
}

type Resource = { section: string; id: string; name: string; detail: string; type: "aircraft" | "instructor" | "room" };

type UnifiedEvent = {
  id: string;
  source: "reservation" | "unavailability";
  date: string;
  startTime: string;
  endTime: string;
  type: Reservation["type"] | ResourceUnavailability["reason"];
  aircraftId?: string;
  instructorId?: string;
  roomId?: string;
  studentId?: string;
  title?: string;
  notes?: string;
  status?: string;
};

type PendingCreate = {
  resource: Resource;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  aircraftId: string;
  instructorId: string;
  roomId: string;
  studentId: string;
  title: string;
  notes: string;
};

function reservationToEvent(r: Reservation): UnifiedEvent {
  return {
    id: r.id,
    source: "reservation",
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    type: r.type,
    aircraftId: r.aircraftId,
    instructorId: r.instructorId,
    roomId: (r as any).roomId,
    studentId: r.studentId,
    title: r.lesson,
    notes: r.notes,
    status: r.status,
  };
}

function unavailabilityToEvent(item: ResourceUnavailability, date: string): UnifiedEvent {
  return {
    id: item.id,
    source: "unavailability",
    date,
    startTime: date === item.startDate ? item.startTime : "07:00",
    endTime: date === item.endDate ? item.endTime : "21:00",
    type: item.reason,
    aircraftId: item.resourceType === "aircraft" ? item.resourceId : undefined,
    instructorId: item.resourceType === "instructor" ? item.resourceId : undefined,
    title: item.reason,
    notes: item.notes,
    status: item.status,
  };
}

function unavailabilityVisible(item: ResourceUnavailability, date: string) {
  return item.status === "Active" && item.startDate <= date && date <= item.endDate;
}

export default function SchedulePage() {
  const data = useFlightDirectorData();
  const today = new Date().toISOString().slice(0, 10);

  const [view, setView] = useState<"Jour" | "Semaine" | "Ressources">("Ressources");
  const [date, setDate] = useState(today);
  const [resourceView, setResourceView] = useState("Toutes");
  const [aircraftFilter, setAircraftFilter] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<{ id: string; source: UnifiedEvent["source"] } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; source: UnifiedEvent["source"] } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; source: UnifiedEvent["source"]; mode: "start" | "end" } | null>(null);
  const [message, setMessage] = useState("");
  const [airport, setAirport] = useState("CYQB");
  const [metar, setMetar] = useState("");
  const [taf, setTaf] = useState("");
  const [weatherError, setWeatherError] = useState("");
  const [cancelReason, setCancelReason] = useState("Météo");
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelComment, setCancelComment] = useState("");
  const [notifyStudent, setNotifyStudent] = useState(false);
  const [notifyInstructor, setNotifyInstructor] = useState(false);
  const [releaseAircraft, setReleaseAircraft] = useState(true);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);

  const reservations = data.reservations.items;
  const unavailabilities = data.unavailabilities.items;
  const students = data.students.items;
  const instructors = data.instructors.items;
  const aircraft = data.aircraft.items;

  const scheduleLoading =
    data.aircraft.loading ||
    data.instructors.loading ||
    data.students.loading ||
    data.reservations.loading ||
    data.unavailabilities.loading;

  const scheduleError =
    data.aircraft.error ||
    data.instructors.error ||
    data.students.error ||
    data.reservations.error ||
    data.unavailabilities.error;

  const unifiedEvents = useMemo(() => {
    const items: UnifiedEvent[] = [];

    reservations.forEach((reservation) => {
      items.push(reservationToEvent(reservation));
    });

    unavailabilities.forEach((item) => {
      const days = Array.from({ length: 31 }, (_, index) => addDays(item.startDate, index));
      days
        .filter((day) => unavailabilityVisible(item, day))
        .forEach((day) => items.push(unavailabilityToEvent(item, day)));
    });

    return items;
  }, [reservations, unavailabilities]);

  const selectedEvent = selected ? unifiedEvents.find((event) => event.id === selected.id && event.source === selected.source) : undefined;

  async function loadWeather() {
    try {
      setWeatherError("");
      setMetar("Chargement via serveur...");
      setTaf("Chargement via serveur...");
      const response = await fetch(`/api/weather?station=${airport}`);
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || "Impossible de charger METAR/TAF.");
      }
      const weather = await response.json();
      setMetar(weather.metar || "Aucun METAR disponible.");
      setTaf(weather.taf || "Aucun TAF disponible.");
    } catch (error: any) {
      setWeatherError(error.message || "Erreur météo.");
      setMetar("");
      setTaf("");
    }
  }

  useEffect(() => {
    loadWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredEvents = unifiedEvents.filter((event) => {
    if (view !== "Semaine" && event.date !== date) return false;
    if (view === "Semaine") {
      const days = Array.from({ length: 7 }, (_, index) => addDays(date, index));
      if (!days.includes(event.date)) return false;
    }

    if (aircraftFilter && event.aircraftId !== aircraftFilter) return false;
    if (instructorFilter && event.instructorId !== instructorFilter) return false;
    if (studentFilter && event.studentId !== studentFilter) return false;
    if (typeFilter && event.type !== typeFilter) return false;
    return true;
  });

  const resources = useMemo(() => {
    const rows: Resource[] = [];

    if (resourceView === "Toutes" || resourceView === "Avions") {
      aircraft.forEach((a) =>
        rows.push({
          section: "AVIONS",
          id: a.id,
          name: a.registration,
          detail: `${a.type} · ${a.status}`,
          type: "aircraft",
        })
      );
    }

    if (resourceView === "Toutes" || resourceView === "Instructeurs") {
      instructors.forEach((i) =>
        rows.push({
          section: "INSTRUCTEURS",
          id: i.id,
          name: `${i.firstName} ${i.lastName}`,
          detail: i.classLevel,
          type: "instructor",
        })
      );
    }

    if (resourceView === "Toutes" || resourceView === "Locaux") {
      SCHOOL_ROOMS.forEach((room) =>
        rows.push({
          section: "LOCAUX",
          id: room.id,
          name: room.name,
          detail: room.detail,
          type: "room",
        })
      );
    }

    return rows;
  }, [aircraft, instructors, resourceView]);

  function eventVisibleOnResource(event: UnifiedEvent, resource: Resource) {
    if (resource.type === "aircraft") return event.aircraftId === resource.id;
    if (resource.type === "room") return event.roomId === resource.id;
    if (resource.type === "instructor") {
      if (isAircraftOnly(String(event.type))) return false;
      if (event.type !== "Double commande" && event.type !== "Sol" && event.type !== "Simulateur" && event.type !== "Examen") return false;
      return event.instructorId === resource.id;
    }
    return false;
  }

  function eventsForResource(resource: Resource) {
    return filteredEvents.filter((event) => eventVisibleOnResource(event, resource));
  }

  function eventLabel(event: UnifiedEvent) {
    const student = event.studentId ? data.studentMap[event.studentId] : undefined;
    const instructor = event.instructorId ? data.instructorMap[event.instructorId] : undefined;
    const plane = event.aircraftId ? data.aircraftMap[event.aircraftId] : undefined;
    const room = event.roomId ? SCHOOL_ROOMS.find((item) => item.id === event.roomId) : undefined;

    if (isAircraftOnly(String(event.type))) {
      return {
        title: `${event.startTime} - ${event.endTime}`,
        line1: String(event.type),
        line2: event.title || event.notes || plane?.registration || "",
      };
    }

    if (isRoomActivity(String(event.type))) {
      return {
        title: `${event.startTime} - ${event.endTime}`,
        line1: student ? `${student.firstName} ${student.lastName}` : String(event.type),
        line2: `${room?.name || "Local"}${instructor ? ` · ${instructor.lastName}` : ""}`,
      };
    }

    return {
      title: `${event.startTime} - ${event.endTime}`,
      line1: student ? `${student.firstName} ${student.lastName}` : String(event.type),
      line2:
        event.type === "Solo"
          ? `${plane?.registration || ""} Solo`
          : `${plane?.registration || ""}${instructor ? ` (${instructor.lastName})` : ""}`,
    };
  }


  function conflicts(candidate: UnifiedEvent) {
    return unifiedEvents.some((event) => {
      if (event.id === candidate.id && event.source === candidate.source) return false;
      if (event.date !== candidate.date) return false;

      const overlap = event.startTime < candidate.endTime && candidate.startTime < event.endTime;
      if (!overlap) return false;

      // Une personne ne peut jamais avoir deux activités en même temps,
      // peu importe la raison ou le type d'activité.
      if (candidate.studentId && event.studentId === candidate.studentId) return true;
      if (candidate.instructorId && event.instructorId === candidate.instructorId) return true;

      // Les ressources physiques ne peuvent pas être doublées.
      if (candidate.aircraftId && event.aircraftId === candidate.aircraftId) return true;
      if (candidate.roomId && event.roomId === candidate.roomId) return true;

      return false;
    });
  }


  async function updateEvent(event: UnifiedEvent, patch: Partial<UnifiedEvent>) {
    const candidate = { ...event, ...patch };

    if (conflicts(candidate)) {
      setMessage("Conflit : cette activité chevauche déjà une ressource.");
      return false;
    }

    if (event.source === "reservation") {
      const reservationPatch: Partial<Reservation> = {
        date: patch.date,
        startTime: patch.startTime,
        endTime: patch.endTime,
        type: patch.type as Reservation["type"],
        aircraftId: patch.aircraftId,
        instructorId: patch.instructorId,
        studentId: patch.studentId,
        lesson: patch.title,
        notes: patch.notes,
      };

      Object.keys(reservationPatch).forEach((key) => (reservationPatch as any)[key] === undefined && delete (reservationPatch as any)[key]);
      await updateDocument("reservations", event.id, reservationPatch as any);
    } else {
      const original = unavailabilities.find((item) => item.id === event.id);
      const unavailabilityPatch: Partial<ResourceUnavailability> = {
        startDate: patch.date && original?.startDate === event.date ? patch.date : undefined,
        endDate: patch.date && original?.endDate === event.date ? patch.date : undefined,
        startTime: patch.startTime,
        endTime: patch.endTime,
        reason: patch.type as ResourceUnavailability["reason"],
        notes: patch.notes,
      };

      if (patch.aircraftId) {
        unavailabilityPatch.resourceType = "aircraft";
        unavailabilityPatch.resourceId = patch.aircraftId;
      }
      if (patch.instructorId) {
        unavailabilityPatch.resourceType = "instructor";
        unavailabilityPatch.resourceId = patch.instructorId;
      }

      Object.keys(unavailabilityPatch).forEach((key) => (unavailabilityPatch as any)[key] === undefined && delete (unavailabilityPatch as any)[key]);
      await updateDocument("unavailabilities", event.id, unavailabilityPatch as any);
    }

    const status = aircraftStatusForActivity(String(patch.type || event.type));
    const aircraftId = patch.aircraftId || event.aircraftId;
    if (status && aircraftId) {
      await updateDocument("aircraft", aircraftId, { status } as any);
    }

    setMessage("Activité modifiée.");
    return true;
  }


  function openCreateFromCell(resource: Resource, mouseEvent: React.MouseEvent<HTMLDivElement>) {
    const target = mouseEvent.target as HTMLElement;
    if (target.closest(".unified-event")) return;

    const rect = mouseEvent.currentTarget.getBoundingClientRect();
    const x = mouseEvent.clientX - rect.left;
    const start = roundToHalfHour(minutes("07:00") + (x / 96) * 60);

    const plane =
      resource.type === "aircraft"
        ? aircraft.find((item) => item.id === resource.id)
        : aircraft.find((item) => item.status === "Disponible") || aircraft[0];

    const instructor =
      resource.type === "instructor"
        ? instructors.find((item) => item.id === resource.id)
        : "";

    const defaultType =
      resource.type === "aircraft"
        ? "Solo"
        : resource.type === "instructor"
          ? "Double commande"
          : "Sol";

    setPendingCreate({
      resource,
      date,
      startTime: toTime(start),
      endTime: toTime(start + 90),
      type: defaultType,
      aircraftId: resource.type === "aircraft" ? resource.id : plane?.id || "",
      instructorId: resource.type === "instructor" && instructor ? instructor.id : "",
      roomId: resource.type === "room" ? resource.id : "",
      studentId: "",
      title: resource.type === "room" ? "Réservation local" : "Nouvelle activité",
      notes: "",
    });
  }

  async function submitPendingCreate() {
    if (!pendingCreate) return;

    const type = pendingCreate.type;
    const candidate: UnifiedEvent = {
      id: "candidate",
      source: isAircraftOnly(type) ? "unavailability" : "reservation",
      date: pendingCreate.date,
      startTime: pendingCreate.startTime,
      endTime: pendingCreate.endTime,
      type: type as any,
      aircraftId: pendingCreate.aircraftId || undefined,
      instructorId: pendingCreate.instructorId || undefined,
      roomId: pendingCreate.roomId || undefined,
      studentId: pendingCreate.studentId || undefined,
      title: pendingCreate.title,
      notes: pendingCreate.notes,
    };

    if (conflicts(candidate)) {
      setMessage("Conflit : une ressource ou une personne est déjà utilisée dans cette plage horaire.");
      return;
    }

    if (isAircraftOnly(type)) {
      if (!pendingCreate.aircraftId) {
        setMessage("Cette activité nécessite un avion.");
        return;
      }

      const item: Omit<ResourceUnavailability, "id"> = {
        resourceType: "aircraft",
        resourceId: pendingCreate.aircraftId,
        startDate: pendingCreate.date,
        startTime: pendingCreate.startTime,
        endDate: pendingCreate.date,
        endTime: pendingCreate.endTime,
        reason: type as ResourceUnavailability["reason"],
        notes: pendingCreate.notes || pendingCreate.title || type,
        status: "Active",
      };

      await createWithGeneratedId("unavailabilities", item, `${pendingCreate.aircraftId}-${pendingCreate.date}-${pendingCreate.startTime}`);
      const status = aircraftStatusForActivity(type);
      if (status) await updateDocument("aircraft", pendingCreate.aircraftId, { status } as any);
      setPendingCreate(null);
      setMessage("Activité créée.");
      return;
    }

    const reservation: Omit<Reservation, "id"> = {
      date: pendingCreate.date,
      startTime: pendingCreate.startTime,
      endTime: pendingCreate.endTime,
      studentId: pendingCreate.studentId || "",
      aircraftId: pendingCreate.aircraftId || "",
      roomId: pendingCreate.roomId || "",
      instructorId: pendingCreate.instructorId || "",
      type: type as Reservation["type"],
      lesson: pendingCreate.title || type,
      status: "Planifié",
      notes: pendingCreate.notes || "",
    } as any;

    await createWithGeneratedId("reservations", reservation, `event-${pendingCreate.date}-${pendingCreate.startTime}`);
    setPendingCreate(null);
    setMessage("Réservation créée.");
  }

  async function createEvent(resource: Resource, event: React.MouseEvent<HTMLDivElement>) {
    if (event.detail !== 2) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const start = roundToHalfHour(minutes("07:00") + (x / 96) * 60);

    const plane = resource.type === "aircraft" ? aircraft.find((a) => a.id === resource.id) : aircraft.find((a) => a.status === "Disponible") || aircraft[0];
    const instructor = resource.type === "instructor" ? instructors.find((i) => i.id === resource.id) : instructors[0];
    const student = students[0];

    if (resource.type === "room") {
      const reservation: Omit<Reservation, "id"> = {
        date,
        startTime: toTime(start),
        endTime: toTime(start + 90),
        studentId: student?.id || "",
        aircraftId: "",
        roomId: resource.id,
        instructorId: "",
        type: "Sol",
        lesson: "Activité au sol",
        status: "Planifié",
        notes: "",
      } as any;

      const candidate = reservationToEvent({ ...reservation, id: "candidate" } as Reservation);
      if (conflicts(candidate)) {
        setMessage("Conflit : le local, l'élève ou l'instructeur est déjà utilisé.");
        return;
      }

      await createWithGeneratedId("reservations", reservation, `room-${resource.id}-${date}-${reservation.startTime}`);
      setMessage("Activité local créée.");
      return;
    }

    if (!plane) {
      setMessage("Il manque un avion.");
      return;
    }

    const type = resource.type === "aircraft" ? "Maintenance" : "Double commande";

    if (isAircraftOnly(type)) {
      const item: Omit<ResourceUnavailability, "id"> = {
        resourceType: "aircraft",
        resourceId: plane.id,
        startDate: date,
        startTime: toTime(start),
        endDate: date,
        endTime: toTime(start + 90),
        reason: type as ResourceUnavailability["reason"],
        notes: type,
        status: "Active",
      };

      const candidate: UnifiedEvent = {
        id: "candidate",
        source: "unavailability",
        date,
        startTime: item.startTime,
        endTime: item.endTime,
        type: item.reason,
        aircraftId: plane.id,
        title: item.reason,
        notes: item.notes,
      };

      if (conflicts(candidate)) {
        setMessage("Conflit : l'avion est déjà utilisé.");
        return;
      }

      await createWithGeneratedId("unavailabilities", item, `${plane.registration}-${date}-${item.startTime}`);
      await updateDocument("aircraft", plane.id, { status: "Maintenance" } as any);
      setMessage("Activité maintenance créée.");
      return;
    }

    if (!student) {
      setMessage("Il manque un étudiant.");
      return;
    }

    const reservation: Omit<Reservation, "id"> = {
      date,
      startTime: toTime(start),
      endTime: toTime(start + 90),
      studentId: student.id,
      aircraftId: plane.id,
      instructorId: instructor?.id || "",
      type: "Double commande",
      lesson: "Nouvelle réservation",
      status: "Planifié",
      notes: "",
    };

    const candidate = reservationToEvent({ ...reservation, id: "candidate" } as Reservation);
    if (conflicts(candidate)) {
      setMessage("Conflit : une ressource est déjà utilisée.");
      return;
    }

    await createWithGeneratedId("reservations", reservation, `reservation-${date}-${reservation.startTime}`);
    setMessage("Réservation créée.");
  }

  async function handleDrop(resource: Resource, event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();

    if (resizing) {
      await handleResizeDrop(resource, event);
      return;
    }

    if (!dragging) return;
    const current = unifiedEvents.find((item) => item.id === dragging.id && item.source === dragging.source);
    if (!current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const newStart = roundToHalfHour(minutes("07:00") + (x / 96) * 60);
    const duration = minutes(current.endTime) - minutes(current.startTime);

    const patch: Partial<UnifiedEvent> = {
      startTime: toTime(newStart),
      endTime: toTime(newStart + duration),
    };

    if (resource.type === "aircraft") patch.aircraftId = resource.id;
    if (resource.type === "room") { (patch as any).roomId = resource.id; if (isAircraftOnly(String(current.type))) patch.type = "Sol"; }
    if (resource.type === "instructor") {
      patch.instructorId = resource.id;
      if (isAircraftOnly(String(current.type))) patch.type = "Sol";
    }

    await updateEvent(current, patch);
    setDragging(null);
  }

  async function handleResizeDrop(resource: Resource, dragEvent: React.DragEvent<HTMLDivElement>) {
    if (!resizing) return;

    const current = unifiedEvents.find((item) => item.id === resizing.id && item.source === resizing.source);
    if (!current) return;

    const rect = dragEvent.currentTarget.getBoundingClientRect();
    const x = dragEvent.clientX - rect.left;
    const newTime = toTime(roundToHalfHour(minutes("07:00") + (x / 96) * 60));

    const patch: Partial<UnifiedEvent> = {};
    if (resizing.mode === "start") {
      if (minutes(newTime) >= minutes(current.endTime) - 30) {
        setMessage("Le début doit rester avant la fin.");
        setResizing(null);
        return;
      }
      patch.startTime = newTime;
    } else {
      if (minutes(newTime) <= minutes(current.startTime) + 30) {
        setMessage("La fin doit rester après le début.");
        setResizing(null);
        return;
      }
      patch.endTime = newTime;
    }

    await updateEvent(current, patch);
    setResizing(null);
  }




  async function deleteSelected(reason?: string) {
    if (!selectedEvent) {
      setMessage("Aucune activité sélectionnée.");
      return;
    }

    const finalReason = reason || cancelReason || "Autre";

    try {
      await createWithGeneratedId("cancellations", {
        eventId: selectedEvent.id,
        source: selectedEvent.source,
        date: selectedEvent.date,
        startTime: selectedEvent.startTime,
        endTime: selectedEvent.endTime,
        type: selectedEvent.type,
        aircraftId: selectedEvent.aircraftId || "",
        instructorId: selectedEvent.instructorId || "",
        studentId: selectedEvent.studentId || "",
        roomId: selectedEvent.roomId || "",
        title: selectedEvent.title || "",
        notes: selectedEvent.notes || "",
        reason: finalReason,
        comment: cancelComment || "",
        notifyStudent,
        notifyInstructor,
        releaseAircraft,
        cancelledAt: new Date().toISOString(),
      }, `cancel-${selectedEvent.id}`);

      await deleteDocument(
        selectedEvent.source === "reservation" ? "reservations" : "unavailabilities",
        selectedEvent.id
      );

      if (releaseAircraft && selectedEvent.aircraftId) {
        await updateDocument("aircraft", selectedEvent.aircraftId, { status: "Disponible" } as any);
      }

      setSelected(null);
      setShowCancelModal(false);
      setCancelComment("");
      setNotifyStudent(false);
      setNotifyInstructor(false);
      setMessage(`Activité supprimée. Raison : ${finalReason}.`);
    } catch (error: any) {
      setMessage(error.message || "Erreur pendant la suppression.");
    }
  }


  async function inlineUpdate(patch: Partial<UnifiedEvent>) {
    if (!selectedEvent) return;

    const targetType = String(patch.type || selectedEvent.type);
    const newSource = isAircraftOnly(targetType) ? "unavailability" : "reservation";

    if (selectedEvent.source !== newSource) {
      if (newSource === "unavailability") {
        const planeId = patch.aircraftId || selectedEvent.aircraftId;
        if (!planeId) {
          setMessage("Une activité maintenance/hors service doit avoir un avion.");
          return;
        }
        const item: Omit<ResourceUnavailability, "id"> = {
          resourceType: "aircraft",
          resourceId: planeId,
          startDate: selectedEvent.date,
          startTime: patch.startTime || selectedEvent.startTime,
          endDate: selectedEvent.date,
          endTime: patch.endTime || selectedEvent.endTime,
          reason: targetType as ResourceUnavailability["reason"],
          notes: patch.title || selectedEvent.title || targetType,
          status: "Active",
        };
        await createWithGeneratedId("unavailabilities", item, `${planeId}-${selectedEvent.date}-${item.startTime}`);
        await deleteDocument("reservations", selectedEvent.id);
        setSelected(null);
        const status = aircraftStatusForActivity(targetType);
        if (status) await updateDocument("aircraft", planeId, { status } as any);
        setMessage("Activité convertie.");
        return;
      }

      const student = students[0];
      if (!student) {
        setMessage("Il manque un étudiant pour convertir en vol.");
        return;
      }
      const reservation: Omit<Reservation, "id"> = {
        date: selectedEvent.date,
        startTime: selectedEvent.startTime,
        endTime: selectedEvent.endTime,
        studentId: student.id,
        aircraftId: selectedEvent.aircraftId || aircraft[0]?.id || "",
        instructorId: patch.instructorId || instructors[0]?.id || "",
        type: targetType as Reservation["type"],
        lesson: patch.title || selectedEvent.title || targetType,
        notes: selectedEvent.notes || "",
        status: "Planifié",
      };
      await createWithGeneratedId("reservations", reservation, `${reservation.aircraftId}-${reservation.date}-${reservation.startTime}`);
      await deleteDocument("unavailabilities", selectedEvent.id);
      setSelected(null);
      setMessage("Activité convertie en réservation.");
      return;
    }

    await updateEvent(selectedEvent, patch);
  }

  function exportCSV() {
    const rows = [["date","start","end","type","student","instructor","aircraft","room","title","source"]];
    unifiedEvents.forEach((event) => {
      const s = event.studentId ? data.studentMap[event.studentId] : undefined;
      const i = event.instructorId ? data.instructorMap[event.instructorId] : undefined;
      const a = event.aircraftId ? data.aircraftMap[event.aircraftId] : undefined;
      const room = event.roomId ? SCHOOL_ROOMS.find((item) => item.id === event.roomId) : undefined;
      rows.push([
        event.date, event.startTime, event.endTime, String(event.type),
        s ? `${s.firstName} ${s.lastName}` : "",
        i ? `${i.firstName} ${i.lastName}` : "",
        a ? `${a.registration} ${a.type}` : "",
        room ? room.name : "",
        event.title || event.notes || "", event.source
      ]);
    });
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "orizon-flight-director-horaire.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const now = date === today ? nowPosition() : null;
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(date, index));
  let lastSection = "";

  return (
    <AppShell>
      <div className="header">
        <div>
          <h1>Horaire</h1>
          <div className="subtitle">Version 10.1.1 · chargement Firestore optimisé</div>
        </div>
        <a className="button" href="/schedule/new">+ Nouvelle activité</a>
      </div>

      <div className="scheduler-wrap">
        {scheduleError && (
          <div className="conflict-box" style={{ margin: 18 }}>
            {scheduleError}
          </div>
        )}

        {scheduleLoading && (
          <div className="loading-panel">
            <div className="loading-title loading-dots">Chargement de l’horaire</div>
            <div className="muted">
              Connexion à Firestore et synchronisation des avions, instructeurs, élèves, locaux et réservations.
            </div>
          </div>
        )}

        {!scheduleLoading && (
          <>
        <div className="schedule-actionbar">
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button className="button secondary" onClick={() => setDate(today)}>Aujourd'hui</button>
            <button className="button secondary" onClick={() => setDate(addDays(date, -1))}>←</button>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button className="button secondary" onClick={() => setDate(addDays(date, 1))}>→</button>
          </div>

          <div className="schedule-view-tabs">
            <button className={view === "Jour" ? "button small" : "button secondary small"} onClick={() => setView("Jour")}>Jour</button>
            <button className={view === "Semaine" ? "button small" : "button secondary small"} onClick={() => setView("Semaine")}>Semaine</button>
            <button className={view === "Ressources" ? "button small" : "button secondary small"} onClick={() => setView("Ressources")}>Ressources</button>
            <button className="button secondary small" onClick={() => window.print()}>Imprimer</button>
            <button className="button secondary small" onClick={exportCSV}>CSV</button>
          </div>
        </div>

        <div className="weather-strip">
          <div className="weather-card">
            <div className="section" style={{ marginTop: 0 }}>Aéroport</div>
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <input value={airport} onChange={(event) => setAirport(event.target.value.toUpperCase())} />
              <button className="button small" onClick={loadWeather}>Météo</button>
            </div>
            {weatherError && <div className="muted" style={{ color: "#991b1b", marginTop: 8 }}>{weatherError}</div>}
          </div>
          <div className="weather-card">
            <div className="section" style={{ marginTop: 0 }}>METAR</div>
            <div className="weather-raw">{metar || "Clique sur Météo."}</div>
          </div>
          <div className="weather-card">
            <div className="section" style={{ marginTop: 0 }}>TAF / NOTAM</div>
            <div className="weather-raw">{taf || "Clique sur Météo."}</div>
            <a className="button secondary small" style={{ marginTop: 10 }} href="https://plan.navcanada.ca/wxrecall/" target="_blank">Ouvrir NOTAM NAV CANADA</a>
          </div>
        </div>

        <div className="scheduler-help">
          Clique une cellule vide pour créer une activité sur un avion, instructeur ou local. Glisse les blocs pour modifier l’horaire.
        </div>

        {message && (
          <div className={message.toLowerCase().includes("conflit") ? "conflict-box" : "success-box"} style={{ margin: 16 }}>
            {message}
          </div>
        )}

        <div className="scheduler-filters">
          <select value={resourceView} onChange={(event) => setResourceView(event.target.value)}>
            <option>Toutes</option>
            <option>Avions</option>
            <option>Instructeurs</option>
            <option>Locaux</option>
          </select>

          <select value={aircraftFilter} onChange={(event) => setAircraftFilter(event.target.value)}>
            <option value="">Tous les avions</option>
            {aircraft.map((a) => <option key={a.id} value={a.id}>{a.registration} · {a.type} · {a.status}</option>)}
          </select>

          <select value={instructorFilter} onChange={(event) => setInstructorFilter(event.target.value)}>
            <option value="">Tous les instructeurs</option>
            {instructors.map((i) => <option key={i.id} value={i.id}>{i.firstName} {i.lastName}</option>)}
          </select>

          <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)}>
            <option value="">Tous les étudiants</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">Tous les types</option>
            {ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>

          <a className="button secondary" href="/fleet">Flotte</a>
        </div>

        {view === "Semaine" ? (
          <div className="panel">
            <div className="week-scheduler">
              {weekDays.map((day) => (
                <section className="card week-column" key={day}>
                  <strong>{day}</strong>
                  {filteredEvents
                    .filter((event) => event.date === day)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((event) => {
                      const label = eventLabel(event);
                      return (
                        <div className={`week-reservation ${eventClass(String(event.type))}`} key={`${event.source}-${event.id}-${day}`}>
                          <strong>{label.title}</strong>
                          <div>{label.line1}</div>
                          <div>{label.line2}</div>
                          <div>{event.title || event.notes}</div>
                        </div>
                      );
                    })}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="scheduler-scroll">
            {now !== null && (
              <>
                <div className="now-line" style={{ left: now }} />
                <div className="now-label" style={{ left: now }}>Maintenant</div>
              </>
            )}

            <div className="scheduler-grid">
              <div className="scheduler-resource header">Ressources</div>
              {HOURS.map((h) => <div className="scheduler-cell header" key={h}>{h}</div>)}

              {resources.map((resource) => {
                const showSection = resource.section !== lastSection;
                lastSection = resource.section;

                return (
                  <div style={{ display: "contents" }} key={`${resource.type}-${resource.id}`}>
                    {showSection && <div className="resource-section">{resource.section}</div>}

                    <div className="scheduler-resource">
                      <div className="resource-name">{resource.name}</div>
                      <div className="resource-detail">{resource.detail}</div>
                    </div>

                    <div
                      className="scheduler-cell scheduler-row-layer"
                      style={{ gridColumn: "span 15", cursor: "crosshair" }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.currentTarget.classList.add("drop-target");
                      }}
                      onDragLeave={(event) => event.currentTarget.classList.remove("drop-target")}
                      onDrop={(event) => {
                        event.currentTarget.classList.remove("drop-target");
                        handleDrop(resource, event);
                      }}
                      onClick={(event) => openCreateFromCell(resource, event)}
                    >
                      {HOURS.map((h, index) => (
                        <div
                          key={h}
                          className="scheduler-cell-grid"
                          style={{ left: `${index * 96}px`, width: "96px" }}
                        />
                      ))}

                      {eventsForResource(resource).map((event) => {
                        const label = eventLabel(event);
                        const conflict = conflicts(event);
                        const isSelected = selected?.id === event.id && selected?.source === event.source;

                        return (
                          <button
                            key={`${resource.type}-${resource.id}-${event.source}-${event.id}`}
                            draggable={!resizing}
                            className={`unified-event ${eventClass(String(event.type))} ${conflict ? "conflict" : ""} ${isSelected ? "selected" : ""}`}
                            style={eventStyle(event)}
                            onDragStart={(dragEvent) => {
                              if (resizing) return;
                              setDragging({ id: event.id, source: event.source });
                              dragEvent.dataTransfer.setData("text/plain", event.id);
                            }}
                            onDragEnd={() => setDragging(null)}
                            onClick={(clickEvent) => {
                              clickEvent.preventDefault();
                              clickEvent.stopPropagation();
                              setSelected({ id: event.id, source: event.source });
                            }}
                          >
                            <span
                              className="resize-handle left"
                              draggable
                              onDragStart={(dragEvent) => {
                                dragEvent.stopPropagation();
                                setResizing({ id: event.id, source: event.source, mode: "start" });
                                dragEvent.dataTransfer.setData("text/plain", event.id);
                              }}
                              onDragEnd={() => setResizing(null)}
                            />
                            <strong>{label.title}</strong>
                            <div className="activity-kind">{String(event.type)}</div>
                            <div>{label.line1}</div>
                            <div>{label.line2}</div>
                            <span
                              className="resize-handle right"
                              draggable
                              onDragStart={(dragEvent) => {
                                dragEvent.stopPropagation();
                                setResizing({ id: event.id, source: event.source, mode: "end" });
                                dragEvent.dataTransfer.setData("text/plain", event.id);
                              }}
                              onDragEnd={() => setResizing(null)}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="legend">
          <div className="legend-item"><span className="legend-color" style={{ background: "#dcfce7" }} />Double commande</div>
          <div className="legend-item"><span className="legend-color" style={{ background: "#dbeafe" }} />Solo</div>
          <div className="legend-item"><span className="legend-color" style={{ background: "#fee2e2" }} />Maintenance</div>
          <div className="legend-item"><span className="legend-color" style={{ background: "#111827" }} />Hors service</div>
          <div className="legend-item"><span className="legend-color" style={{ background: "#fed7aa" }} />Inspection</div>
          <div className="legend-item"><span className="legend-color" style={{ background: "#ede9fe" }} />Sol / Sim / Examen</div>
        </div>

        {selectedEvent && (
          <div className="quick-panel">
            <div>
              <strong>{selectedEvent.startTime} - {selectedEvent.endTime} · {String(selectedEvent.type)}</strong>
              <div className="muted">
                {data.aircraftMap[selectedEvent.aircraftId || ""]?.registration || SCHOOL_ROOMS.find((r) => r.id === selectedEvent.roomId)?.name || ""}
                {selectedEvent.studentId ? ` · ${data.studentMap[selectedEvent.studentId]?.firstName} ${data.studentMap[selectedEvent.studentId]?.lastName}` : ""}
              </div>
            </div>

            <div className="quick-panel-actions">
              <button className="button secondary small" onClick={() => updateEvent(selectedEvent, { startTime: toTime(minutes(selectedEvent.startTime) - 30), endTime: toTime(minutes(selectedEvent.endTime) - 30) })}>← 30 min</button>
              <button className="button secondary small" onClick={() => updateEvent(selectedEvent, { startTime: toTime(minutes(selectedEvent.startTime) + 30), endTime: toTime(minutes(selectedEvent.endTime) + 30) })}>30 min →</button>
              <button className="button secondary small danger-button" onClick={() => setShowCancelModal(true)}>Supprimer</button>
            </div>
          </div>
        )}


        {selectedEvent && showCancelReason && (
          <div className="delete-reason-panel" style={{ margin: 16 }}>
            <strong>Raison de suppression</strong>
            <select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
              {CANCEL_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
            <button className="button small" onClick={() => deleteSelected(cancelReason)}>
              Confirmer la suppression
            </button>
            <button className="button secondary small" onClick={() => setShowCancelReason(false)}>
              Annuler
            </button>
          </div>
        )}



        {pendingCreate && (
          <div className="modal-backdrop">
            <section className="modal-card">
              <div className="modal-header">
                <div>
                  <h2>Nouvelle réservation / activité</h2>
                  <div className="subtitle">
                    {pendingCreate.resource.name} · {pendingCreate.startTime} - {pendingCreate.endTime}
                  </div>
                </div>
                <button className="button secondary small" onClick={() => setPendingCreate(null)}>
                  Fermer
                </button>
              </div>

              <div className="modal-body form">
                <div className="formgrid">
                  <input
                    type="date"
                    value={pendingCreate.date}
                    onChange={(event) => setPendingCreate({ ...pendingCreate, date: event.target.value })}
                  />
                  <select
                    value={pendingCreate.type}
                    onChange={(event) => setPendingCreate({
                      ...pendingCreate,
                      type: event.target.value,
                      title: isAircraftOnly(event.target.value) ? event.target.value : pendingCreate.title,
                      instructorId: isAircraftOnly(event.target.value) ? "" : pendingCreate.instructorId,
                    })}
                  >
                    {ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </div>

                <div className="formgrid">
                  <input
                    type="time"
                    value={pendingCreate.startTime}
                    onChange={(event) => setPendingCreate({ ...pendingCreate, startTime: event.target.value })}
                  />
                  <input
                    type="time"
                    value={pendingCreate.endTime}
                    onChange={(event) => setPendingCreate({ ...pendingCreate, endTime: event.target.value })}
                  />
                </div>

                <select
                  value={pendingCreate.aircraftId}
                  onChange={(event) => setPendingCreate({ ...pendingCreate, aircraftId: event.target.value })}
                >
                  <option value="">Aucun avion</option>
                  {aircraft.map((plane) => (
                    <option key={plane.id} value={plane.id}>
                      {plane.registration} · {plane.type} · {plane.status}
                    </option>
                  ))}
                </select>

                <select
                  value={pendingCreate.roomId}
                  onChange={(event) => setPendingCreate({ ...pendingCreate, roomId: event.target.value })}
                >
                  <option value="">Aucun local</option>
                  {SCHOOL_ROOMS.map((room) => (
                    <option key={room.id} value={room.id}>{room.name}</option>
                  ))}
                </select>

                {!isAircraftOnly(pendingCreate.type) && (
                  <>
                    <select
                      value={pendingCreate.studentId}
                      onChange={(event) => setPendingCreate({ ...pendingCreate, studentId: event.target.value })}
                    >
                      <option value="">Aucun étudiant</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>
                      ))}
                    </select>

                    <select
                      value={pendingCreate.instructorId}
                      onChange={(event) => setPendingCreate({ ...pendingCreate, instructorId: event.target.value })}
                    >
                      <option value="">Aucun instructeur</option>
                      {instructors.map((instructor) => (
                        <option key={instructor.id} value={instructor.id}>{instructor.firstName} {instructor.lastName}</option>
                      ))}
                    </select>
                  </>
                )}

                <input
                  placeholder="Titre / description"
                  value={pendingCreate.title}
                  onChange={(event) => setPendingCreate({ ...pendingCreate, title: event.target.value })}
                />

                <textarea
                  placeholder="Notes"
                  value={pendingCreate.notes}
                  onChange={(event) => setPendingCreate({ ...pendingCreate, notes: event.target.value })}
                />
              </div>

              <div className="modal-footer">
                <button className="button secondary" onClick={() => setPendingCreate(null)}>
                  Annuler
                </button>
                <button className="button" onClick={submitPendingCreate}>
                  Créer
                </button>
              </div>
            </section>
          </div>
        )}

        {selectedEvent && showCancelModal && (
          <div className="modal-backdrop">
            <section className="modal-card">
              <div className="modal-header">
                <div>
                  <h2>Annuler / supprimer l’activité</h2>
                  <div className="subtitle">
                    {selectedEvent.startTime} - {selectedEvent.endTime} · {String(selectedEvent.type)}
                  </div>
                </div>
                <button className="button secondary small" onClick={() => setShowCancelModal(false)}>
                  Fermer
                </button>
              </div>

              <div className="modal-body form">
                <label>
                  <div className="section" style={{ marginTop: 0 }}>Raison</div>
                  <select value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
                    {CANCEL_REASONS.map((reason) => (
                      <option key={reason}>{reason}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <div className="section">Commentaire optionnel</div>
                  <textarea
                    placeholder="Ex. inspection 100 h, plafond trop bas, instructeur malade..."
                    value={cancelComment}
                    onChange={(event) => setCancelComment(event.target.value)}
                  />
                </label>

                <label className="toolbar" style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={notifyStudent} onChange={(event) => setNotifyStudent(event.target.checked)} />
                  Aviser automatiquement l’élève
                </label>

                <label className="toolbar" style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={notifyInstructor} onChange={(event) => setNotifyInstructor(event.target.checked)} />
                  Aviser automatiquement l’instructeur
                </label>

                <label className="toolbar" style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={releaseAircraft} onChange={(event) => setReleaseAircraft(event.target.checked)} />
                  Libérer immédiatement l’avion
                </label>

                <div className="cancel-history">
                  L’annulation sera enregistrée dans l’historique avec la date, la raison et le commentaire.
                </div>
              </div>

              <div className="modal-footer">
                <button className="button secondary" onClick={() => setShowCancelModal(false)}>
                  Annuler
                </button>
                <button className="button danger" onClick={() => deleteSelected(cancelReason)}>
                  Supprimer la réservation
                </button>
              </div>
            </section>
          </div>
        )}

        {selectedEvent && (
          <div className="inline-tools v9">
            <span className="inline-chip">Activité</span>

            <select value={String(selectedEvent.type)} onChange={(event) => inlineUpdate({ type: event.target.value as any, title: isAircraftOnly(event.target.value) ? event.target.value : selectedEvent.title })}>
              {ACTIVITY_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>

            <select value={selectedEvent.aircraftId || ""} onChange={(event) => inlineUpdate({ aircraftId: event.target.value })}>
              <option value="">Aucun avion</option>
              {aircraft.map((plane) => <option key={plane.id} value={plane.id}>{plane.registration} · {plane.type} · {plane.status}</option>)}
            </select>
            <select value={selectedEvent.roomId || ""} onChange={(event) => inlineUpdate({ roomId: event.target.value } as any)}>
              <option value="">Aucun local</option>
              {SCHOOL_ROOMS.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>

            {!isAircraftOnly(String(selectedEvent.type)) && (
              <>
                <select value={selectedEvent.studentId || ""} onChange={(event) => inlineUpdate({ studentId: event.target.value })}>
                  <option value="">Aucun étudiant</option>
                  {students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}
                </select>

                <select value={selectedEvent.instructorId || ""} onChange={(event) => inlineUpdate({ instructorId: event.target.value })}>
                  <option value="">Aucun instructeur</option>
                  {instructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.firstName} {instructor.lastName}</option>)}
                </select>
              </>
            )}

            <input
              value={selectedEvent.title || selectedEvent.notes || ""}
              placeholder="Description"
              onChange={(event) => inlineUpdate({ title: event.target.value, notes: event.target.value })}
            />

            <button className="button secondary small danger-button" onClick={() => setShowCancelModal(true)}>Supprimer</button>
            <button className="button secondary small" onClick={() => setSelected(null)}>Fermer</button>
          </div>
        )}
          </>
        )}
      </div>
    </AppShell>
  );
}
