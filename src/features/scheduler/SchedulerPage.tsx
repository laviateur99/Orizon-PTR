"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { canDeleteReservation } from "./types";
import { DEFAULT_RESOURCES } from "./data";
import {
  assertAircraftMaintenanceCompliance,
  assignLessonToStudentPTR,
  completeFlightAndApplyAirTime,
  markLinkedPTRLessonAfterCheckout,
  resourceGroupKey,
  removeReservation,
  saveReservation,
  subscribeCancellations,
  subscribeLeaveBlocks,
  subscribeReservations,
  subscribeResourceOrderSettings,
  subscribeResources,
  subscribeSnagBlocks,
  subscribeStudents,
  subscribeSchedulerSettings,
  updateFlightOperation,
  updateMaintenanceReservationSchedule,
  type StudentOption,
} from "./firestore";
import type {
  ActivityType,
  Cancellation,
  SchedulerEvent,
  SchedulerResource,
} from "./types";
import { DEFAULT_SCHEDULER_SETTINGS, type SchedulerSettings } from "./settings";
import { ATPA_PROGRAM } from "@/features/programs/data";
import { checkScheduleCompliance } from "@/features/duty/compliance";
import { useAuth } from "@/features/auth/AuthProvider";
import { syncCompletedActivityTimeEntries } from "@/features/employees/firestore";
import {
  minutesToTimeInput,
  quebecLocalInputToDate,
  quebecNowMinutes,
  quebecToday,
  timeInputToMinutes,
} from "@/lib/quebecDateTime";
const H = 72;
const INTERACTION_SNAP_MINUTES = 5;
const CLICK_SLOT_MINUTES = 30;
const RESOURCE_W = 190;
const TIME_W = 72;
const METAR_STATION = "CYQB";
const TYPES: ActivityType[] = [
  "Double commande",
  "Solo",
  "Sol",
  "Simulateur",
  "Examen",
  "Maintenance",
  "Hors service",
  "Supervision solo",
  "Administration",
  "Cours théorique",
  "Test en vol",
  "Vol de navigation AEC DEC",
  "Vol de P/D double",
  "Vol de P/D solo",
];
const REASONS = [
  "Météo",
  "Maintenance",
  "NOTAM",
  "Instructeur malade",
  "Élève malade",
  "Avion indisponible",
  "Conflit d’horaire",
  "Reporté",
  "Autre",
];
const CUMULATIVE_SOLO_LESSONS = new Set([50, 51, 52]);
const componentActivityType = (modality: string): ActivityType =>
  /solo/i.test(modality)
    ? "Solo"
    : /sol|théorie|ground|briefing/i.test(modality)
      ? "Sol"
      : /dev|simulateur/i.test(modality)
        ? "Simulateur"
        : "Double commande";
const usesWeather = (type: ActivityType) =>
  type === "Double commande" || type === "Solo";
const aircraftFamilyClass = (resource: SchedulerResource) => {
  if (resource.kind !== "aircraft") return "";
  const value = `${resource.groupLabel || ""} ${resource.detail || ""}`;
  return /152/i.test(value)
    ? "aircraft-c152"
    : /172/i.test(value)
      ? "aircraft-c172"
      : /PA-?31|Navajo/i.test(value)
        ? "aircraft-pa31"
        : "aircraft-other";
};
const aircraftFamilyLabel = (resource: SchedulerResource) => {
  const family = aircraftFamilyClass(resource);
  return family === "aircraft-c152"
    ? "152"
    : family === "aircraft-c172"
      ? "172"
      : family === "aircraft-pa31"
        ? "PA31"
        : "Avion";
};
const resourceTypeLabel = (resource: SchedulerResource) =>
  resource.kind === "aircraft"
    ? aircraftFamilyLabel(resource)
    : resource.kind === "simulator"
      ? "Simulateur"
      : resource.kind === "instructor"
        ? "Instructeur"
        : "Local";
const resourceUnavailableOnDate = (
  resource: SchedulerResource,
  day: string,
) => {
  if (resource.blocked) return true;
  if (
    resource.status !== "Maintenance planifiée" ||
    !resource.maintenanceStartAt ||
    !resource.expectedReturnAt
  )
    return false;
  const dayStart = quebecLocalInputToDate(`${day}T00:00`)?.getTime() ?? 0,
    dayEnd =
      quebecLocalInputToDate(`${day}T23:59`)?.getTime() ??
      Number.MAX_SAFE_INTEGER;
  return (
    new Date(resource.maintenanceStartAt).getTime() <= dayEnd &&
    new Date(resource.expectedReturnAt).getTime() >= dayStart
  );
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const snap = (v: number, step: number) => Math.round(v / step) * step;
const label = (v: number) =>
  `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
const cls = (t: ActivityType) =>
  t === "Solo"
    ? "solo"
    : t === "Maintenance"
      ? "maintenance"
      : t === "Hors service"
        ? "out"
        : t === "Sol"
          ? "ground"
          : t === "Simulateur"
            ? "sim"
            : t === "Examen"
              ? "exam"
              : "dual";
const statusCls = (e: SchedulerEvent) =>
  e.status === "Complété"
    ? "status-completed"
    : e.status === "Check-in" || e.status === "En vol"
      ? "status-checkin"
      : "status-planned";
const ids = (e: SchedulerEvent): string[] =>
  [e.resourceId, e.aircraftId, e.instructorId, e.roomId].filter(
    (id): id is string => Boolean(id),
  );
const studentIds = (e: SchedulerEvent) =>
  [e.studentId, ...(e.participantStudentIds || [])].filter((id): id is string =>
    Boolean(id),
  );
const scheduleCategory = (r: SchedulerResource) =>
  r.kind === "aircraft"
    ? { key: "aircraft", label: "Avions" }
    : r.kind === "simulator"
      ? { key: "simulator", label: "Simulateurs" }
      : r.kind === "instructor"
        ? { key: "instructor", label: "Instructeurs" }
        : { key: "room", label: "Locaux" };
function overlapsDate(c: SchedulerEvent, x: SchedulerEvent) {
  return (
    c.date <= (x.rangeEndDate || x.date) && x.date <= (c.rangeEndDate || c.date)
  );
}
function intervalOnDate(event: SchedulerEvent, day: string) {
  if (day < event.date || day > (event.rangeEndDate || event.date)) return null;
  return {
    start: day === event.date ? event.startMinutes : 0,
    end: day === (event.rangeEndDate || event.date) ? event.endMinutes : 1440,
  };
}
function nextDate(day: string) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
function conflict(c: SchedulerEvent, events: SchedulerEvent[]) {
  return events.find((x) => {
    if (
      x.id === c.id ||
      !overlapsDate(c, x) ||
      (!ids(c).some((id) => ids(x).includes(id)) &&
        !studentIds(c).some((id) => studentIds(x).includes(id)))
    )
      return false;
    let day = c.date > x.date ? c.date : x.date;
    const last =
      (c.rangeEndDate || c.date) < (x.rangeEndDate || x.date)
        ? c.rangeEndDate || c.date
        : x.rangeEndDate || x.date;
    for (let count = 0; day <= last && count < 370; count += 1) {
      const a = intervalOnDate(c, day),
        b = intervalOnDate(x, day);
      if (a && b && b.start < a.end && a.start < b.end) return true;
      day = nextDate(day);
    }
    return false;
  });
}
function inRange(date: string, e: SchedulerEvent) {
  return e.source === "snag" ||
    e.source === "leave" ||
    e.source === "maintenanceWorkOrder"
    ? date >= e.date && date <= (e.rangeEndDate || e.date)
    : e.date === date;
}
const localDate = quebecToday;
const nowMinutes = quebecNowMinutes;
function airtime(a: string, b: string) {
  if (!a || !b) return undefined;
  const [ah, am] = a.split(":").map(Number),
    [bh, bm] = b.split(":").map(Number);
  let value = bh * 60 + bm - (ah * 60 + am);
  if (value < 0) value += 1440;
  return value;
}
type Draft = {
  id?: string;
  resourceId: string;
  date: string;
  type: ActivityType;
  startMinutes: number;
  endMinutes: number;
  endManuallyEdited: boolean;
  studentId: string;
  studentName: string;
  aircraftId: string;
  instructorId: string;
  roomId: string;
  simulatorTcId: string;
  title: string;
  notes: string;
  overdueAlertMinutes: string;
  lessonPlanId: string;
  lessonTitle: string;
  lessonPdfPath: string;
  lessonComponentId: string;
};
type Ops = {
  event: SchedulerEvent;
  mode: "checkin" | "checkout";
  dispatch: string;
  hobbsStart: string;
  hobbsEnd: string;
  takeoffTime: string;
  landingTime: string;
  groundTimeHours: string;
  overdueAlertMinutes: string;
  metar: string;
  flightCrewRole: "Double" | "PIC";
  dayHours: string;
  nightHours: string;
  instrumentAircraftHours: string;
  ftdHours: string;
  crossCountryDayHours: string;
  crossCountryNightHours: string;
  routeFrom: string;
  routeTo: string;
};
type PointerDrag = {
  event: SchedulerEvent;
  mode: "move" | "start" | "end";
  originX: number;
  originY: number;
  originScrollLeft: number;
  offsetX: number;
  originStart: number;
  originEnd: number;
  originResourceId: string;
  currentResourceId: string;
};
export function SchedulerPage() {
  const { profile, user } = useAuth();
  const canManageMaintenanceSchedule = Boolean(
    profile &&
      ["Administrateur", "Directeur de maintenance", "Maintenance", "Instructeur", "Dispatch", "Chef instructeur"].includes(
        profile.role,
      ),
  );
  const [date, setDate] = useState(localDate);
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [snagBlocks, setSnagBlocks] = useState<SchedulerEvent[]>([]);
  const [leaveBlocks, setLeaveBlocks] = useState<SchedulerEvent[]>([]);
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(4);
  const [error, setError] = useState("");
  const [message, setMessageText] = useState("");
  const [messageAction, setMessageAction] = useState<{href?: string; event?: SchedulerEvent; label: string} | null>(null);
  function setMessage(value: string) { setMessageText(value); setMessageAction(null); }
  const [resourceFilters, setResourceFilters] = useState<string[]>([]);
  function toggleResourceFilter(group: string) {
    setResourceFilters(current => current.includes(group) ? current.filter(item => item !== group) : [...current, group]);
  }
  const [resourceSearch, setResourceSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSuggestOpen, setStudentSuggestOpen] = useState(false);
  const [studentRowSearch, setStudentRowSearch] = useState("");
  const [studentRowSuggestOpen, setStudentRowSuggestOpen] = useState(false);
  const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");

  const [draft, setDraft] = useState<Draft | null>(null);
  const savingReservation = useRef(false);
  const [reservationSaving, setReservationSaving] = useState(false);
  const setDraftError = setMessage;
  const [ops, setOps] = useState<Ops | null>(null);
  const [opsError, setOpsError] = useState("");
  const [metarLoading, setMetarLoading] = useState(false);
  const [deleteEvent, setDeleteEvent] = useState<SchedulerEvent | null>(null);
  const [deleteReason, setDeleteReason] = useState(REASONS[0]);
  const [deleteComment, setDeleteComment] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tick, setTick] = useState(0);
  const [settings, setSettings] = useState<SchedulerSettings>(
    DEFAULT_SCHEDULER_SETTINGS,
  );
  const [orderSettings, setOrderSettings] = useState<{
    groups: string[];
    resources: Record<string, string[]>;
  }>({ groups: [], resources: {} });
  const [drag, setDrag] = useState<PointerDrag | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const didAutoScroll = useRef(false);
  const didPointerDrag = useRef(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("date");
    if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) setDate(requested);
  }, []);
  useEffect(() => {
    const fail = (e: Error) => setError(e.message);
    const done = () => setLoading((x) => Math.max(0, x - 1));
    setLoading(6);
    const a = subscribeResources({
        next: (x) => {
          setResources(x);
          done();
        },
        error: fail,
      }),
      b = subscribeReservations({
        next: (x) => {
          setEvents(x);
          done();
        },
        error: fail,
      }),
      c = subscribeSnagBlocks({
        next: (x) => {
          setSnagBlocks(x);
          done();
        },
        error: fail,
      }),
      d = subscribeStudents({
        next: (x) => {
          setStudents(x);
          done();
        },
        error: fail,
      }),
      e = subscribeCancellations({ next: setCancellations, error: fail }),
      f = subscribeSchedulerSettings({
        next: (x) => {
          setSettings(x[0] || DEFAULT_SCHEDULER_SETTINGS);
          done();
        },
        error: fail,
      }),
      g = subscribeResourceOrderSettings(setOrderSettings, fail),
      h = subscribeLeaveBlocks({
        next: (x) => {
          setLeaveBlocks(x);
          done();
        },
        error: fail,
      });
    return () => {
      a();
      b();
      c();
      d();
      e();
      f();
      g();
      h();
    };
  }, []);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(i);
  }, []);
  const lessonOptions = ATPA_PROGRAM.lessons.flatMap((lesson) =>
    lesson.components.map((component, index) => ({
      id: `P${lesson.phase}-L${lesson.number}-C${index + 1}`,
      label: `Phase ${lesson.phase} · Leçon ${lesson.number} · ${component.modality} · ${lesson.title}${CUMULATIVE_SOLO_LESSONS.has(lesson.number) && component.hours.solo > 0 ? ` · cumul ${component.hours.solo} h` : ""}`,
      title: `Leçon ${lesson.number} — ${lesson.title}`,
      pdfPath: component.pdfPath || component.manualPdfPath || "",
      componentId: `${lesson.number}-${index + 1}`,
      type: componentActivityType(component.modality),
      cumulativeTargetHours:
        CUMULATIVE_SOLO_LESSONS.has(lesson.number) && component.hours.solo > 0
          ? component.hours.solo
          : 0,
      plannedMinutes:
        CUMULATIVE_SOLO_LESSONS.has(lesson.number) && component.hours.solo > 0
          ? 120
          : Math.max(
              15,
              Math.round(
                (component.hours.sol +
                  component.hours.dev +
                  component.hours.doubleCommande +
                  component.hours.solo) *
                  60,
              ),
            ),
    })),
  );
  const compatibleLessonOptions = lessonOptions.filter(option => option.type === draft?.type);
  const simulatorResources: SchedulerResource[] = [
    {
      id: "SIM-DCX",
      kind: "simulator",
      name: "DCX",
      detail: "Simulateur DCX",
      groupLabel: "Simulateurs",
    },
    {
      id: "SIM-737MAX",
      kind: "simulator",
      name: "737MAX",
      detail: "Simulateur Boeing 737 MAX",
      groupLabel: "Simulateurs",
    },
  ];
  const snagWorkOrderIds = useMemo(
    () =>
      new Set(
        snagBlocks
          .map((item) => item.maintenanceWorkOrderId)
          .filter((item): item is string => Boolean(item)),
      ),
    [snagBlocks],
  );
  const allEvents = useMemo(() => {
    const workOrders = new Map(
      events
        .filter(
          (item) =>
            item.source === "maintenanceWorkOrder" &&
            item.maintenanceWorkOrderId,
        )
        .map((item) => [item.maintenanceWorkOrderId as string, item]),
    );
    const combinedSnags = snagBlocks.map((item) => {
      const workOrder = item.maintenanceWorkOrderId
        ? workOrders.get(item.maintenanceWorkOrderId)
        : undefined;
      return workOrder
        ? {
            ...item,
            title: item.title.replace("SNAG —", "SNAG / MAINTENANCE —"),
            prmName: workOrder.prmName,
            technicianName: workOrder.technicianName,
          }
        : item;
    });
    return [
      ...events.filter(
        (item) => item.status !== "Annulé" &&
          !(
            item.source === "maintenanceWorkOrder" &&
            item.maintenanceWorkOrderId &&
            snagWorkOrderIds.has(item.maintenanceWorkOrderId)
          ),
      ),
      ...combinedSnags,
      ...leaveBlocks,
    ];
  }, [events, snagBlocks, leaveBlocks, snagWorkOrderIds]);
  const visible = useMemo(
    () =>
      allEvents
        .filter((e) => inRange(date, e))
        .flatMap((e) =>
          [...new Set(ids(e))].map((resourceId) => ({
            ...e,
            ...((e.source === "maintenanceWorkOrder" || e.source === "snag") &&
            e.rangeEndDate
              ? {
                  startMinutes: date === e.date ? e.startMinutes : 0,
                  endMinutes: date === e.rangeEndDate ? e.endMinutes : 1440,
                }
              : {}),
            primaryResourceId: e.resourceId,
            resourceId,
          })),
        ),
    [allEvents, date],
  );
  const currentHour =
    date === localDate() ? Math.floor(nowMinutes() / 60) : settings.startHour;
  const eventStart = visible.length
    ? Math.floor(
        Math.min(
          ...visible.map((e) =>
            e.rangeEndDate && date !== e.date
              ? settings.startHour * 60
              : e.startMinutes,
          ),
        ) / 60,
      )
    : settings.startHour;
  const eventEnd = visible.length
    ? Math.ceil(
        Math.max(
          ...visible.map((e) =>
            e.rangeEndDate && date !== e.rangeEndDate
              ? settings.endHour * 60
              : e.endMinutes,
          ),
        ) / 60,
      )
    : settings.endHour;
  const START = Math.max(
    0,
    Math.min(settings.startHour, eventStart, currentHour),
  );
  const END = Math.min(
    24,
    Math.max(settings.endHour, eventEnd, currentHour + 1),
  );
  const HOURS = Array.from({ length: END - START + 1 }, (_, i) => START + i);
  const baseList = resources.length ? resources : DEFAULT_RESOURCES;
  const list = useMemo(() => {
    const merged = [...baseList];
    simulatorResources.forEach((item) => {
      if (!merged.some((existing) => existing.id === item.id))
        merged.push(item);
    });

    const fallbackGroups = [
      "Avions — Cessna 152",
      "Avions — Cessna 172",
      "Avions — Piper Navajo PA-31",
      "Simulateurs",
      "Instructeurs",
      "Locaux",
    ];
    const groups = [
      ...orderSettings.groups,
      ...fallbackGroups.filter(
        (group) => !orderSettings.groups.includes(group),
      ),
    ];

    const groupIndex = (resource: SchedulerResource) => {
      const index = groups.indexOf(resourceGroupKey(resource));
      return index === -1 ? groups.length : index;
    };
    const resourceIndex = (resource: SchedulerResource) => {
      const ids = orderSettings.resources[resourceGroupKey(resource)] || [];
      const index = ids.indexOf(resource.id);
      return index === -1 ? ids.length : index;
    };

    return merged.sort(
      (a, b) =>
        groupIndex(a) - groupIndex(b) ||
        resourceIndex(a) - resourceIndex(b) ||
        a.name.localeCompare(b.name),
    );
  }, [baseList, orderSettings]);
  const studentRowSuggestions = students.filter(s => studentRowSearch && normalizeSearch(s.name).includes(normalizeSearch(studentRowSearch))).sort((a,b) => a.name.localeCompare(b.name, "fr")).slice(0, 8);
  const filteredList = list.filter(r => (!resourceFilters.length || resourceFilters.includes(resourceGroupKey(r))) && normalizeSearch(`${r.name} ${r.detail}`).includes(normalizeSearch(resourceSearch)) && (!studentRowSearch || visible.some(e => e.resourceId === r.id && normalizeSearch(e.studentName || "").includes(normalizeSearch(studentRowSearch)))));
  const filteredStudents = students.filter(s => s.id === draft?.studentId || normalizeSearch(s.name).includes(normalizeSearch(studentSearch))).sort((a,b) => a.name.localeCompare(b.name, "fr"));
  function showConflict(candidate: SchedulerEvent, other: SchedulerEvent) {
    const shared = ids(candidate).filter(id => ids(other).includes(id)).map(id => list.find(r => r.id === id)?.name || id);
    shared.push(...studentIds(candidate).filter(id => studentIds(other).includes(id)).map(id => students.find(s => s.id === id)?.name || id));
    setMessage(`Conflit : ${[...new Set(shared)].join(", ")} — ${other.title} (${other.date}${other.rangeEndDate ? ` au ${other.rangeEndDate}` : ""}, ${label(other.startMinutes)}–${label(other.endMinutes)}).`);
    const href = other.source === "snag" ? `/maintenance?snagId=${encodeURIComponent(other.snagId || other.id)}` : other.source === "maintenanceWorkOrder" ? `/maintenance?workOrderId=${encodeURIComponent(other.maintenanceWorkOrderId || other.id)}` : other.source === "leave" ? "/employees?tab=leave" : other.theoreticalSessionId ? `/theory?session=${encodeURIComponent(other.theoreticalSessionId)}` : undefined;
    setMessageAction({href, event: href ? undefined : other, label: "Ouvrir l’élément en conflit"});
  }
  function renderMessage() { return message && <div className={/conflit|bloqu|obligatoire|refusé/i.test(message) ? "notice error" : "notice"} role="status">{message}{messageAction && <div>{messageAction.href ? <a href={messageAction.href} target="_blank" rel="noreferrer">{messageAction.label}</a> : <button type="button" className="button secondary small" onClick={() => { if(messageAction.event) openEdit(messageAction.event); }}>{messageAction.label}</button>}</div>}</div>; }

  const isToday = date === localDate();
  const currentMinutes = nowMinutes();
  const currentTimeVisible =
    isToday && currentMinutes >= START * 60 && currentMinutes <= END * 60;
  const nowTop = ((currentMinutes - START * 60) / 60) * H;
  function scrollToNow() {
    setDate(localDate());
    requestAnimationFrame(() => {
      const viewport = gridRef.current;
      if (!viewport) return;
      const target =
        ((nowMinutes() - START * 60) / 60) * H - viewport.clientHeight / 2;
      viewport.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    });
  }
  function shiftDate(days: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDate(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`,
    );
  }
  function complianceFor(candidate: SchedulerEvent) {
    return checkScheduleCompliance(
      candidate,
      events,
      students,
      list
        .filter((item) => item.kind === "instructor")
        .map((item) => ({ id: item.id, name: item.name })),
    );
  }
  function authorizeCompliance(
    candidate: SchedulerEvent,
    reportError: (message: string) => void = setMessage,
  ) {
    const issues = complianceFor(candidate),
      blocks = issues.filter((item) => item.severity === "block"),
      warnings = issues.filter((item) => item.severity === "warning" && !item.breakKey),
      pauses = issues.filter((item) => Boolean(item.breakKey));
    const lines = (values: typeof issues) =>
      values.map((item) => `• ${item.personName} : ${item.message}`).join("\n");
    if (blocks.length) {
      const reason = window.prompt(
        `DÉPASSEMENT DES LIMITES\n\n${lines(blocks)}\n\nLa réservation est bloquée. Pour une dérogation du chef-instructeur, inscrivez une justification :`,
      );
      if (!reason?.trim()) {
        reportError(
          `Réservation bloquée — ${blocks[0].personName} : ${blocks[0].message}.`,
        );
        return null;
      }
      candidate = { ...candidate, complianceOverrideReason: reason.trim() };
    }
    if (
      warnings.length &&
      !window.confirm(
        `AVERTISSEMENT SERVICE / REPOS\n\n${lines(warnings)}\n\nVoulez-vous tout de même enregistrer la réservation?`,
      )
    ) {
      reportError(
        `Réservation annulée — ${warnings[0].personName} : ${warnings[0].message}.`,
      );
      return null;
    }
    if (pauses.length) {
      if (!profile || !["Instructeur", "Chef instructeur", "Administrateur"].includes(profile.role)) {
        reportError("Pause à confirmer par un instructeur avant la prochaine leçon.");
        return null;
      }
      if (!window.confirm(`PAUSE DE L’ÉTUDIANT\n\n${lines(pauses)}\n\nEn cliquant OK, je confirme que l’étudiant a eu sa pause avant la leçon suivante. Cette confirmation ne modifie ni les horaires, ni les temps de service ou de vol.`)) {
        reportError("Enregistrement annulé : la pause de l’étudiant n’a pas été confirmée.");
        return null;
      }
      candidate = {...candidate, studentBreakConfirmations: [
        ...(candidate.studentBreakConfirmations || []),
        ...pauses.map(issue => ({key: issue.breakKey!, studentId: issue.personId, confirmedBy: profile.uid,
          confirmedByName: profile.name, confirmedAt: new Date().toISOString()})),
      ]};
    }
    return candidate;
  }
  useEffect(() => {
    if (loading === 0 && isToday && !didAutoScroll.current) {
      didAutoScroll.current = true;
      scrollToNow();
    }
  }, [loading, isToday, START]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("student"))
      setMessage(
        "Élève et prochain plan préparés. Cliquez sur une plage libre pour créer la réservation.",
      );
  }, []);
  function openCreate(r: SchedulerResource, y: number, rect: DOMRect) {
    setStudentSearch("");
    setMessage("");
    if (resourceUnavailableOnDate(r, date)) {
      setMessage(`${r.name} est indisponible à cette date.`);
      return;
    }
    const rel = clamp(y - rect.top, 0, (END - START) * H),
      exactMinutes = START * 60 + (rel / H) * 60,
      start = Math.min(
        Math.floor(exactMinutes / CLICK_SLOT_MINUTES) * CLICK_SLOT_MINUTES,
        24 * 60 - INTERACTION_SNAP_MINUTES,
      );
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const requestedStudent = params.get("student") || "";
    const requestedLesson = params.get("lesson") || "";
    const requestedLessonNumber = params.get("lessonNumber") || "";
    const lesson =
      lessonOptions.find((item) => item.id === requestedLesson) ||
      lessonOptions.find(
        (item) =>
          requestedLessonNumber &&
          item.id.includes(`-L${requestedLessonNumber}-`),
      );
    const student = students.find((item) => item.id === requestedStudent);
    setDraftError("");
    setDraft({
      resourceId: r.id,
      date,
      type:
        lesson?.type ||
        (r.kind === "room"
          ? "Sol"
          : r.kind === "simulator"
            ? "Simulateur"
            : "Double commande"),
      startMinutes: start,
      endMinutes: Math.min(start + 120, 24 * 60),
      endManuallyEdited: false,
      studentId: requestedStudent,
      studentName: student?.name || "",
      aircraftId: r.kind === "aircraft" ? r.id : "",
      instructorId:
        params.get("instructor") || (r.kind === "instructor" ? r.id : ""),
      roomId: r.kind === "room" || r.kind === "simulator" ? r.id : "",
      simulatorTcId: "",
      title: lesson?.title || params.get("lessonTitle") || "",
      notes: "",
      overdueAlertMinutes: "",
      lessonPlanId: lesson?.id || requestedLesson,
      lessonTitle: lesson?.title || params.get("lessonTitle") || "",
      lessonPdfPath: lesson?.pdfPath || "",
      lessonComponentId: lesson?.componentId || "",
    });
  }
  function openEdit(e: SchedulerEvent) {
    setStudentSearch("");
    setMessage("");
    if (
      e.source === "maintenanceWorkOrder" &&
      e.status === "Complété"
    ) {
      setMessage(
        "Ce créneau de maintenance est conservé comme historique et ne peut plus être déplacé.",
      );
      return;
    }
    if (
      e.source === "maintenanceWorkOrder" &&
      e.rangeEndDate &&
      e.rangeEndDate !== e.date
    ) {
      setMessage(
        "Cette maintenance couvre plusieurs jours. Modifiez ses dates dans l’ordre de travail PRM/DOM.",
      );
      return;
    }
    if (e.source === "maintenanceWorkOrder" && !canManageMaintenanceSchedule) {
      setMessage(
        "Ce créneau de maintenance est en lecture seule. Seuls le PRM, le DOM ou un administrateur peuvent le modifier.",
      );
      return;
    }
    if (e.source === "leave") {
      setMessage(
        "Ce bloc provient d’un congé approuvé. Modifiez-le dans Employés > Congés.",
      );
      return;
    }
    if (e.source === "snag") {
      setMessage(
        "Ce bloc provient d’un SNAG. Modifie-le dans le module Flotte.",
      );
      return;
    }
    if (e.theoreticalSessionId) {
      window.location.assign(
        `/theory?session=${encodeURIComponent(e.theoreticalSessionId)}`,
      );
      return;
    }
    setDraftError("");
    setDraft({
      id: e.id,
      resourceId: e.primaryResourceId || e.resourceId,
      date: e.date,
      type: e.type,
      startMinutes: e.startMinutes,
      endMinutes: e.endMinutes,
      endManuallyEdited: true,
      studentId: e.studentId || "",
      studentName: e.studentName || "",
      aircraftId: e.aircraftId || "",
      instructorId: e.instructorId || "",
      roomId: e.roomId || "",
      simulatorTcId: e.simulatorTcId || "",
      title: e.title,
      notes: e.notes || "",
      overdueAlertMinutes: e.overdueAlertMinutes?.toString() || "",
      lessonPlanId: e.lessonPlanId || "",
      lessonTitle: e.lessonTitle || "",
      lessonPdfPath: e.lessonPdfPath || "",
      lessonComponentId: e.lessonComponentId || "",
    });
  }
  async function save() {
    if (!draft || savingReservation.current) return;
    savingReservation.current = true;
    setReservationSaving(true);
    try { await saveDraft(); }
    finally { savingReservation.current = false; setReservationSaving(false); }
  }
  async function saveDraft() {
    if (!draft) return;
    setDraftError("");
    if (draft.lessonPlanId && !compatibleLessonOptions.some(option => option.id === draft.lessonPlanId)) {
      setDraftError("Le plan sélectionné ne correspond pas au type d’activité. Choisissez un plan compatible ou Aucun plan de leçon.");
      return;
    }
    if (draft.endMinutes <= draft.startMinutes) {
      setDraftError("L’heure de fin doit être après l’heure de début.");
      return;
    }
    if (usesWeather(draft.type)) {
      const student = students.find((item) => item.id === draft.studentId);
      if (!student) {
        setDraftError(
          "Un élève ou un locataire doit être sélectionné pour une réservation de vol.",
        );
        return;
      }
      if (!student.rentalAgreementSigned) {
        setDraftError(
          `Vol bloqué pour ${student.name} : le contrat de location et le consentement doivent être signés dans son PTR.`,
        );
        setMessageAction({href: `/ptr/${student.id}#rental-agreement`, label: "Ouvrir le PTR : contrat et consentement"});
        return;
      }
      if (!student.trainingProgramAgreementSigned) {
        setDraftError(
          `Vol bloqué pour ${student.name} : le programme d’entraînement applicable doit être lu et signé dans son PTR.`,
        );
        setMessageAction({href: `/ptr/${student.id}#training-agreement`, label: "Ouvrir le PTR : programme d’entraînement"});
        return;
      }
      if (
        draft.type === "Solo" &&
        student.preSoloRequired &&
        !student.preSoloAuthorized
      ) {
        setDraftError(
          `Solo bloqué pour ${student.name} : la check-list pré-solo et l’autorisation finale doivent être complétées dans son dossier étudiant.`,
        );
        setMessageAction({href: `/students/${student.id}?tab=Pré-solo`, label: "Compléter la check-list pré-solo"});
        return;
      }
    }
    const previous = draft.id
      ? events.find((x) => x.id === draft.id)
      : undefined;
    const aircraft = list.find((r) => r.id === draft.aircraftId);
    if (
      aircraft &&
      previous?.source !== "maintenanceWorkOrder" &&
      resourceUnavailableOnDate(aircraft, draft.date)
    ) {
      setDraftError(
        `${aircraft.name} est bloqué par maintenance ou SNAG à cette date.`,
      );
      setMessageAction({href: "/maintenance", label: "Ouvrir la maintenance et les SNAG"});
      return;
    }
    const e: SchedulerEvent = {
      ...previous,
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
      simulatorTcId: draft.simulatorTcId || undefined,
      title: draft.title || draft.type,
      notes: draft.notes,
      overdueAlertMinutes: draft.overdueAlertMinutes
        ? Number(draft.overdueAlertMinutes)
        : undefined,
      lessonPlanId: draft.lessonPlanId || undefined,
      lessonTitle: draft.lessonTitle || undefined,
      lessonPdfPath: draft.lessonPdfPath || undefined,
      lessonComponentId: draft.lessonComponentId || undefined,
      status: previous?.status || "Planifié",
      studentBreakConfirmations: previous?.studentBreakConfirmations,
      complianceOverrideReason: previous?.complianceOverrideReason,
    };
    const conflictingEvent = conflict(e, allEvents);
    if (conflictingEvent) {
      showConflict(e, conflictingEvent);
      return;
    }
    const authorized = authorizeCompliance(e, setDraftError);
    if (!authorized) return;
    try {
      if (authorized.source === "maintenanceWorkOrder") {
        const reason = window.prompt(
          "Raison obligatoire de la modification de l’horaire maintenance",
        );
        if (!reason?.trim() || !profile) return;
        await updateMaintenanceReservationSchedule(
          authorized,
          { id: profile.uid, name: profile.name, role: profile.role },
          reason.trim(),
        );
      } else {
        await saveReservation(
          authorized,
          events.some((x) => x.id === e.id),
        );
      }
      // The reservation exists even if the subsequent PTR update fails.
      // Retrying must update this same document, never create another booking.
      setDraft(current => current ? {...current, id: authorized.id} : current);
      setEvents(current => [...current.filter(item => item.id !== authorized.id), authorized]);
      await assignLessonToStudentPTR(authorized);
    } catch (value) {
      setDraftError(
        value instanceof Error
          ? value.message
          : "Réservation bloquée par une échéance de maintenance.",
      );
      return;
    }
    setDraft(null);
    setDraftError("");
    setMessage(
      authorized.complianceOverrideReason
        ? "Réservation enregistrée avec dérogation documentée."
        : "Réservation enregistrée.",
    );
  }
  function late(e: SchedulerEvent) {
    return (
      date === localDate() &&
      !!e.overdueAlertMinutes &&
      ["Check-in", "En vol"].includes(e.status || "") &&
      nowMinutes() > e.endMinutes + e.overdueAlertMinutes
    );
  }
  async function latestMetar() {
    const response = await fetch(`/api/weather?station=${METAR_STATION}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("METAR indisponible");
    const data = (await response.json()) as { raw?: string };
    return data.raw || "";
  }
  async function openOps(e: SchedulerEvent, mode: "checkin" | "checkout") {
    setOpsError("");
    if (mode === "checkin") {
      if (e.type === "Solo") {
        const student = students.find((item) => item.id === e.studentId);
        if (
          !student ||
          (student.preSoloRequired && !student.preSoloAuthorized)
        ) {
          setMessage(
            `Check-out Solo bloqué${student ? ` pour ${student.name}` : ""} : la check-list pré-solo et l’autorisation finale ne sont pas complétées.`,
          );
          if (student) setMessageAction({href: `/students/${student.id}?tab=Pré-solo`, label: "Compléter la check-list pré-solo"});
          return;
        }
      }
      const aircraft = list.find((item) => item.id === e.aircraftId);
      if (aircraft && resourceUnavailableOnDate(aircraft, e.date)) {
        setMessage(
          `${aircraft.name} est indisponible en raison d’un SNAG ou d’une maintenance. Check-out impossible.`,
        );
        setMessageAction({href: "/maintenance", label: "Ouvrir la maintenance et les SNAG"});
        return;
      }
      if (e.aircraftId) {
        try {
          await assertAircraftMaintenanceCompliance(
            e.aircraftId,
            e.date,
            Math.max(0, e.endMinutes - e.startMinutes) / 60,
            e.id,
          );
        } catch (value) {
          setMessage(
            value instanceof Error
              ? value.message
              : "Check-out bloqué par une échéance de maintenance.",
          );
          return;
        }
      }
    }
    setOps({
      event: e,
      mode,
      dispatch: "",
      hobbsStart: e.hobbsStart?.toString() || "",
      hobbsEnd: e.hobbsEnd?.toString() || "",
      takeoffTime: e.takeoffTime || "",
      landingTime: e.landingTime || "",
      groundTimeHours: e.groundTimeHours?.toString() || "",
      overdueAlertMinutes: e.overdueAlertMinutes?.toString() || "",
      metar: mode === "checkin" ? e.checkInMetar || "" : e.checkOutMetar || "",
      flightCrewRole:
        e.flightCrewRole || (e.type === "Solo" ? "PIC" : "Double"),
      dayHours: e.dayHours?.toString() || "",
      nightHours: e.nightHours?.toString() || "",
      instrumentAircraftHours: e.instrumentAircraftHours?.toString() || "",
      ftdHours: e.ftdHours?.toString() || "",
      crossCountryDayHours: e.crossCountryDayHours?.toString() || "",
      crossCountryNightHours: e.crossCountryNightHours?.toString() || "",
      routeFrom: e.routeFrom || (mode === "checkout" && !["Sol", "Simulateur", "Administration", "Cours théorique", "Supervision solo", "Maintenance", "Hors service"].includes(e.type) ? "CYQB" : ""),
      routeTo: e.routeTo || (mode === "checkout" && !["Sol", "Simulateur", "Administration", "Cours théorique", "Supervision solo", "Maintenance", "Hors service"].includes(e.type) ? "CYQB" : ""),
    });
    if (!usesWeather(e.type)) {
      setMetarLoading(false);
      return;
    }
    setMetarLoading(true);
    try {
      const metar = await latestMetar();
      setOps((current) =>
        current && current.event.id === e.id && current.mode === mode
          ? { ...current, metar }
          : current,
      );
    } catch {
      setOpsError(
        `Le METAR ${METAR_STATION} n’a pas pu être récupéré automatiquement. Il peut être saisi manuellement.`,
      );
    } finally {
      setMetarLoading(false);
    }
  }
  async function saveOps() {
    if (!ops || !ops.dispatch.trim()) {
      setOpsError("Le nom du dispatch est obligatoire.");
      return;
    }

    const isNonFlight =
      ops.event.type === "Sol" || ops.event.type === "Simulateur";
    let timeEntryWarning = "";
    if (ops.mode === "checkin") {
      if (!isNonFlight && !ops.hobbsStart) {
        setOpsError("Le Hobbs de départ est obligatoire au check-out.");
        return;
      }

      await updateFlightOperation(ops.event.id, {
        status: "Check-in",
        checkedInAt: new Date().toISOString(),
        checkedInBy: ops.dispatch.trim(),
        ...(!isNonFlight ? { hobbsStart: Number(ops.hobbsStart) } : {}),
        ...(usesWeather(ops.event.type)
          ? { checkInMetar: ops.metar, metarStation: METAR_STATION }
          : {}),
        ...(ops.overdueAlertMinutes
          ? { overdueAlertMinutes: Number(ops.overdueAlertMinutes) }
          : {}),
      });
    } else {
      if (isNonFlight && !ops.groundTimeHours) {
        setOpsError(
          `Le temps ${ops.event.type === "Simulateur" ? "simulateur" : "au sol"} en heures décimales est obligatoire au check-in.`,
        );
        return;
      }
      if (
        !isNonFlight &&
        (!ops.hobbsEnd || !ops.takeoffTime || !ops.landingTime)
      ) {
        setOpsError(
          "Hobbs fin, décollage et atterrissage sont obligatoires au check-in.",
        );
        return;
      }
      if (
        !isNonFlight &&
        Number(ops.dayHours || 0) + Number(ops.nightHours || 0) <= 0
      ) {
        setOpsError(
          "Inscrivez les heures de vol de jour et/ou de nuit pour le PTR.",
        );
        return;
      }
      const recordedPtrHours = Math.max(
        0,
        Number(ops.hobbsEnd) - Number(ops.hobbsStart),
      );
      const classifiedFlightHours =
        Number(ops.dayHours || 0) + Number(ops.nightHours || 0);
      if (
        !isNonFlight &&
        Math.abs(recordedPtrHours - classifiedFlightHours) > 0.11
      ) {
        setOpsError(
          `Le total jour + nuit (${classifiedFlightHours.toFixed(1)} h) doit correspondre au temps Hobbs (${recordedPtrHours.toFixed(1)} h).`,
        );
        return;
      }
      if (
        Number(ops.instrumentAircraftHours || 0) >
        classifiedFlightHours + 0.01
      ) {
        setOpsError(
          "Le temps aux instruments en avion ne peut pas dépasser le total jour + nuit.",
        );
        return;
      }
      if (
        Number(ops.crossCountryDayHours || 0) >
          Number(ops.dayHours || 0) + 0.01 ||
        Number(ops.crossCountryNightHours || 0) >
          Number(ops.nightHours || 0) + 0.01
      ) {
        setOpsError(
          "Le vol-voyage de jour ou de nuit ne peut pas dépasser le temps de vol correspondant.",
        );
        return;
      }
      if (
        ops.event.type === "Simulateur" &&
        Number(ops.ftdHours || ops.groundTimeHours) >
          Number(ops.groundTimeHours) + 0.01
      ) {
        setOpsError(
          "Le temps instruments FTD/DEV ne peut pas dépasser le temps total du simulateur.",
        );
        return;
      }
      if (
        (Number(ops.crossCountryDayHours || 0) > 0 ||
          Number(ops.crossCountryNightHours || 0) > 0) &&
        (!ops.routeFrom.trim() || !ops.routeTo.trim())
      ) {
        setOpsError(
          "Le point de départ et la destination sont obligatoires pour un vol-voyage.",
        );
        return;
      }

      const completedEvent: SchedulerEvent = {
        ...ops.event,
        status: "Complété",
        checkedOutAt: new Date().toISOString(),
        checkedOutBy: ops.dispatch.trim(),
        ...(isNonFlight
          ? {
              groundTimeHours: Number(ops.groundTimeHours),
              ftdHours:
                ops.event.type === "Simulateur"
                  ? Number(ops.ftdHours || ops.groundTimeHours)
                  : undefined,
            }
          : {
              hobbsEnd: Number(ops.hobbsEnd),
              takeoffTime: ops.takeoffTime,
              landingTime: ops.landingTime,
              airtimeMinutes: airtime(ops.takeoffTime, ops.landingTime),
              flightCrewRole: ops.flightCrewRole,
              dayHours: Number(ops.dayHours || 0),
              nightHours: Number(ops.nightHours || 0),
              instrumentAircraftHours: Number(ops.instrumentAircraftHours || 0),
              crossCountryDayHours: Number(ops.crossCountryDayHours || 0),
              crossCountryNightHours: Number(ops.crossCountryNightHours || 0),
              routeFrom: ops.routeFrom.trim(),
              routeTo: ops.routeTo.trim(),
            }),
        ...(usesWeather(ops.event.type)
          ? { checkOutMetar: ops.metar, metarStation: METAR_STATION }
          : {}),
      };
      const operationPatch = {
        status: completedEvent.status,
        checkedOutAt: completedEvent.checkedOutAt,
        checkedOutBy: completedEvent.checkedOutBy,
        hobbsEnd: completedEvent.hobbsEnd,
        takeoffTime: completedEvent.takeoffTime,
        landingTime: completedEvent.landingTime,
        airtimeMinutes: completedEvent.airtimeMinutes,
        checkOutMetar: completedEvent.checkOutMetar,
        groundTimeHours: completedEvent.groundTimeHours,
        metarStation: completedEvent.metarStation,
        flightCrewRole: completedEvent.flightCrewRole,
        dayHours: completedEvent.dayHours,
        nightHours: completedEvent.nightHours,
        instrumentAircraftHours: completedEvent.instrumentAircraftHours,
        ftdHours: completedEvent.ftdHours,
        crossCountryDayHours: completedEvent.crossCountryDayHours,
        crossCountryNightHours: completedEvent.crossCountryNightHours,
        routeFrom: completedEvent.routeFrom,
        routeTo: completedEvent.routeTo,
      };
      if (
        !isNonFlight &&
        completedEvent.aircraftId &&
        completedEvent.airtimeMinutes !== undefined
      ) {
        await completeFlightAndApplyAirTime(
          ops.event.id,
          completedEvent.aircraftId,
          operationPatch,
          completedEvent.airtimeMinutes,
        );
      } else {
        await updateFlightOperation(ops.event.id, operationPatch);
      }

      await markLinkedPTRLessonAfterCheckout(completedEvent);
      if (
        ["Double commande", "Solo", "Sol", "Simulateur"].includes(
          completedEvent.type,
        ) && completedEvent.instructorId
      ) {
        try {
          await syncCompletedActivityTimeEntries(
            completedEvent,
            {
              uid: user?.uid || "",
              name: profile?.name || profile?.email || "Utilisateur",
              role: profile?.role || "",
            },
          );
        } catch (value) {
          timeEntryWarning = ` La synchronisation parallèle Orizon Temps est à reprendre : ${value instanceof Error ? value.message : "erreur inconnue"}`;
        }
      }
    }

    const completedMode = ops.mode;
    setOps(null);
    setOpsError("");
    setMessage(
      `${completedMode === "checkin" ? "Check-out" : "Check-in"} enregistré.${timeEntryWarning}`,
    );
  }

  function beginPointerDrag(
    event: React.PointerEvent,
    item: SchedulerEvent,
    mode: "move" | "start" | "end",
  ) {
    if (
      item.source === "snag" ||
      (item.source === "maintenanceWorkOrder" &&
        item.status === "Complété") ||
      (item.primaryResourceId && item.resourceId !== item.primaryResourceId)
    )
      return;
    if (
      item.source === "maintenanceWorkOrder" &&
      !canManageMaintenanceSchedule
    ) {
      setMessage(
        "Créneau maintenance en lecture seule pour votre rôle.",
      );
      return;
    }
    if (
      item.source === "maintenanceWorkOrder" &&
      item.rangeEndDate &&
      item.rangeEndDate !== item.date
    ) {
      setMessage(
        "Cette maintenance couvre plusieurs jours. Modifiez ses dates dans l’ordre de travail PRM/DOM.",
      );
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    didPointerDrag.current = false;
    setDrag({
      event: item,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      originScrollLeft: gridRef.current?.scrollLeft || 0,
      offsetX: 0,
      originStart: item.startMinutes,
      originEnd: item.endMinutes,
      originResourceId: item.resourceId,
      currentResourceId: item.resourceId,
    });
  }
  function resourceFromPoint(x: number, y: number) {
    // Read column geometry: the captured/translated card can cover the target.
    const columns = gridRef.current?.querySelectorAll<HTMLElement>("[data-resource-id]");
    if (!columns) return "";
    for (const column of Array.from(columns)) {
      const rect = column.getBoundingClientRect();
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom)
        return column.dataset.resourceId || "";
    }
    return "";
  }
  function previewDrag(event: React.PointerEvent) {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 2)
      didPointerDrag.current = true;
    const delta = snap(
      ((event.clientY - drag.originY) / H) * 60,
      INTERACTION_SNAP_MINUTES,
    );
    const originResource = list.find(r => r.id === drag.originResourceId);
    const hoveredResource = list.find(r => r.id === resourceFromPoint(event.clientX, event.clientY));
    const canMoveHorizontally = drag.mode === "move" && drag.event.source !== "maintenanceWorkOrder";
    const validTarget = canMoveHorizontally && hoveredResource?.kind === originResource?.kind;
    const targetResource = validTarget && hoveredResource
      ? hoveredResource.id
      : canMoveHorizontally ? drag.currentResourceId : drag.originResourceId;
    const offsetX = validTarget
      ? event.clientX - drag.originX + (gridRef.current?.scrollLeft || 0) - drag.originScrollLeft
      : canMoveHorizontally ? drag.offsetX : 0;
    const duration = drag.originEnd - drag.originStart;
    let start = drag.originStart,
      end = drag.originEnd;
    if (drag.mode === "move") {
      start = clamp(drag.originStart + delta, START * 60, END * 60 - duration);
      end = start + duration;
    }
    if (drag.mode === "start") {
      start = clamp(
        drag.originStart + delta,
        START * 60,
        drag.originEnd - INTERACTION_SNAP_MINUTES,
      );
    }
    if (drag.mode === "end") {
      end = clamp(
        drag.originEnd + delta,
        drag.originStart + INTERACTION_SNAP_MINUTES,
        END * 60,
      );
    }
    setDrag({
      ...drag,
      currentResourceId: targetResource,
      offsetX,
      event: {
        ...drag.event,
        startMinutes: start,
        endMinutes: end,
        resourceId: targetResource || drag.event.resourceId,
        aircraftId: list.find(
          (r) => r.id === targetResource && r.kind === "aircraft",
        )
          ? targetResource
          : drag.event.aircraftId,
        instructorId: list.find(
          (r) => r.id === targetResource && r.kind === "instructor",
        )
          ? targetResource
          : drag.event.instructorId,
        roomId: list.find((r) => r.id === targetResource && r.kind === "room")
          ? targetResource
          : drag.event.roomId,
      },
    });
  }
  async function finishPointerDrag() {
    if (!drag) return;
    if (!didPointerDrag.current) {
      setDrag(null);
      return;
    }
    const candidate = drag.event;
    const conflictingEvent = conflict(candidate, allEvents);
    if (conflictingEvent) {
      showConflict(candidate, conflictingEvent);
      setDrag(null);
      window.setTimeout(() => {
        didPointerDrag.current = false;
      }, 0);
      return;
    }
    const authorized = authorizeCompliance(candidate);
    if (!authorized) {
      setDrag(null);
      window.setTimeout(() => {
        didPointerDrag.current = false;
      }, 0);
      return;
    }
    try {
      if (authorized.source === "maintenanceWorkOrder") {
        const reason = window.prompt(
          "Raison obligatoire de la modification de l’horaire maintenance",
        );
        if (!reason?.trim() || !profile) {
          setDrag(null);
          return;
        }
        await updateMaintenanceReservationSchedule(
          authorized,
          { id: profile.uid, name: profile.name, role: profile.role },
          reason.trim(),
        );
      } else await saveReservation(authorized, true);
    } catch (value) {
      setMessage(
        value instanceof Error
          ? value.message
          : "Déplacement bloqué par une échéance de maintenance.",
      );
      setDrag(null);
      window.setTimeout(() => {
        didPointerDrag.current = false;
      }, 0);
      return;
    }
    setMessage(
      drag.mode === "move"
        ? "Réservation déplacée."
        : "Durée de la réservation modifiée.",
    );
    setDrag(null);
    window.setTimeout(() => {
      didPointerDrag.current = false;
    }, 0);
  }

  if (loading > 0)
    return (
      <>
        <PageHeader title="Horaire" subtitle="Chargement des opérations…" />
        <section className="card">Chargement…</section>
      </>
    );
  return (
    <>
      <PageHeader
        title="Horaire"
        subtitle="Réservations, check-out, check-in, retards et SNAG"
      />
      <div className="scheduler-toolbar">
        <button
          className="button secondary"
          onClick={() => setDate(localDate())}
        >
          Aujourd’hui
        </button>
        <button className="button now-button" onClick={scrollToNow}>
          Maintenant · {label(currentMinutes)}
        </button>
        <div className="date-stepper">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            aria-label="Jour précédent"
          >
            ‹
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            aria-label="Jour suivant"
          >
            ›
          </button>
        </div>
        <div className="scheduler-resource-filter">
          <span>Ressources</span>
          <div className="role-pills">
            {Array.from(new Set(list.map(resourceGroupKey))).map(group => (
              <button type="button" key={group} className={resourceFilters.includes(group) ? "active" : ""} onClick={() => toggleResourceFilter(group)}>{group}</button>
            ))}
            {resourceFilters.length > 0 && <button type="button" className="button secondary small" onClick={() => setResourceFilters([])}>Toutes</button>}
          </div>
        </div>
        <label>Rechercher<input type="search" value={resourceSearch} onChange={e => setResourceSearch(e.target.value)} placeholder="Avion, instructeur, local…" /></label>
        <label style={{position: "relative"}}>
          Élève
          <input
            type="search"
            value={studentRowSearch}
            onChange={e => { setStudentRowSearch(e.target.value); setStudentRowSuggestOpen(true); }}
            onFocus={() => setStudentRowSuggestOpen(true)}
            onBlur={() => setTimeout(() => setStudentRowSuggestOpen(false), 150)}
            placeholder="Rechercher un élève…"
          />
          {studentRowSuggestOpen && studentRowSearch && (
            <div className="student-suggest-list">
              {studentRowSuggestions.map(s => (
                <button type="button" key={s.id} onMouseDown={() => { setStudentRowSearch(s.name); setStudentRowSuggestOpen(false); }}>{s.name}</button>
              ))}
              {!studentRowSuggestions.length && <p>Aucun résultat.</p>}
            </div>
          )}
        </label>
        {studentRowSearch && <button type="button" className="button secondary small" onClick={() => setStudentRowSearch("")}>Effacer le filtre élève</button>}
        <span className="scheduler-help">
          Glissez une réservation pour la déplacer · tirez son bord supérieur ou
          inférieur pour changer sa durée.
        </span>
      </div>
      {error && <div className="notice error">{error}</div>}
      {!draft && renderMessage()}
      {filteredList.length === 0 && <div className="notice">Aucune ressource ne correspond aux filtres.</div>}
      <section className="scheduler-shell scheduler-vertical">
        <div className="scheduler-scroll" ref={gridRef}>
          <div
            className="scheduler-grid"
            style={{ minWidth: TIME_W + filteredList.length * RESOURCE_W }}
          >
            <div className="vertical-time-axis">
              {HOURS.map((h, j) => (
                <span style={{ top: j * H }} key={h}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            <div className="resource-head">Ressources</div>
            {HOURS.map((h) => (
              <div className="hour-head" key={h}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
            {filteredList.map((r, i, all) => {
              const category = scheduleCategory(r),
                previous = i ? scheduleCategory(all[i - 1]) : null,
                startsCategory = !previous || previous.key !== category.key,
                row = visible.filter((e) => e.resourceId === r.id);
              return (
                <div
                  className={`scheduler-row-wrapper ${aircraftFamilyClass(r)}`}
                  style={{ width: RESOURCE_W, zIndex: drag?.originResourceId === r.id ? 25 : undefined }}
                  key={r.id}
                >
                  <div className={`resource-category category-${category.key}`}>
                    {resourceTypeLabel(r)}
                  </div>
                  <div
                    className={`resource-cell ${resourceUnavailableOnDate(r, date) ? "blocked" : ""}`}
                  >
                    <strong>{r.name}</strong>
                    {resourceUnavailableOnDate(r, date) && (
                      <small>
                        INDISPONIBLE
                        {r.statusReason ? ` — ${r.statusReason}` : ""}
                      </small>
                    )}
                  </div>
                  <div
                    className="time-row"
                    data-drop-target={drag?.mode === "move" && drag.currentResourceId === r.id && drag.originResourceId !== r.id ? "true" : undefined}
                    style={{ height: (END - START) * H }}
                    data-resource-id={r.id}
                    onClick={(m) => {
                      if (drag) return;
                      if (!(m.target as HTMLElement).closest(".schedule-event"))
                        openCreate(
                          r,
                          m.clientY,
                          m.currentTarget.getBoundingClientRect(),
                        );
                    }}
                  >
                    {HOURS.slice(0, -1).map((h, j) => (
                      <div
                        className="hour-cell"
                        style={{ top: j * H }}
                        key={h}
                      />
                    ))}
                    {currentTimeVisible && (
                      <div
                        className="current-time-line"
                        style={{ top: nowTop }}
                        aria-hidden="true"
                      />
                    )}
                    {row.map((e) => {
                      const visibleStart = Math.max(
                          e.startMinutes,
                          START * 60,
                        ),
                        visibleEnd = Math.min(e.endMinutes, END * 60);
                      if (visibleEnd <= visibleStart) return null;
                      const top = ((visibleStart - START * 60) / 60) * H,
                        height = Math.max(
                          18,
                          ((visibleEnd - visibleStart) / 60) * H,
                        ),
                        isLate = late(e);
                      return (
                        <div
                          className={`schedule-event ${cls(e.type)} ${statusCls(e)} ${e.source === "snag" ? "snag-block" : ""} ${e.primaryResourceId && e.resourceId !== e.primaryResourceId ? "linked-mirror" : ""} ${isLate ? "late-flight" : ""} ${drag?.event.id === e.id ? "dragging" : ""}`}
                          style={
                            {
                              transform: drag?.event.id === e.id && drag.originResourceId === r.id ? `translateX(${drag.offsetX}px)` : undefined,
                              willChange: drag?.event.id === e.id ? "transform, top" : undefined,
                              "--event-top": `${drag?.event.id === e.id ? ((drag.event.startMinutes - START * 60) / 60) * H : top}px`,
                              "--event-height": `${drag?.event.id === e.id ? Math.max(18, ((drag.event.endMinutes - drag.event.startMinutes) / 60) * H) : height}px`,
                            } as React.CSSProperties
                          }
                          key={e.id}
                          onPointerDown={(x) => {
                            if (!(x.target as HTMLElement).closest("button,a"))
                              beginPointerDrag(x, e, "move");
                          }}
                          onPointerMove={previewDrag}
                          onPointerUp={() => void finishPointerDrag()}
                          onPointerCancel={() => {
                            setDrag(null);
                            didPointerDrag.current = false;
                          }}
                          onClick={(x) => {
                            x.stopPropagation();
                            if (didPointerDrag.current) return;
                            if (e.source !== "snag") openEdit(e);
                          }}
                        >
                          <button
                            className="resize-handle left"
                            onClick={(x) => x.stopPropagation()}
                            onPointerDown={(x) =>
                              beginPointerDrag(x, e, "start")
                            }
                            aria-label="Changer le début"
                          />
                          <button
                            className="event-drag-handle"
                            onClick={(x) => x.stopPropagation()}
                            onPointerDown={(x) =>
                              beginPointerDrag(x, e, "move")
                            }
                            aria-label="Déplacer la réservation"
                            title="Glisser pour déplacer"
                          >
                            ⋮⋮
                          </button>
                          <div className="event-content">
                            {drag?.event.id === e.id && drag.originResourceId === r.id && drag.currentResourceId !== drag.originResourceId && (
                              <strong aria-live="polite">Vers {list.find(resource => resource.id === drag.currentResourceId)?.name}</strong>
                            )}
                            {e.source === "maintenanceWorkOrder" && (
                              <strong>🔧 MAINTENANCE</strong>
                            )}
                            {e.source === "snag" && (
                              <strong>
                                {e.maintenanceWorkOrderId
                                  ? "⚠ SNAG / 🔧 MAINTENANCE"
                                  : "⚠ SNAG"}
                              </strong>
                            )}
                            {isLate && <strong>⚠ RETARD</strong>}
                            {(e.status === "Check-in" ||
                              e.status === "En vol" ||
                              e.status === "Complété") && (
                              <strong className="event-status-label">
                                {e.status === "Complété"
                                  ? "✓ COMPLÉTÉ"
                                  : "● CHECK-IN"}
                              </strong>
                            )}
                            <span>{e.title}</span>
                            {e.source === "maintenanceWorkOrder" ? (
                              <>
                                <span>
                                  {label(visibleStart)} - {label(visibleEnd)}
                                </span>
                                <span>PRM : {e.prmName || "—"}</span>
                                <span>
                                  Technicien : {e.technicianName || "—"}
                                </span>
                              </>
                            ) : e.source === "snag" ? (
                              <>
                                <span>
                                  {label(visibleStart)} - {label(visibleEnd)}
                                </span>
                                <span>
                                  {e.status === "Complété"
                                    ? "Retour en service approuvé"
                                    : "Indisponible"}
                                </span>
                                {e.maintenanceWorkOrderId && (
                                  <>
                                    <span>PRM : {e.prmName || "—"}</span>
                                    <span>
                                      Technicien : {e.technicianName || "—"}
                                    </span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span>{e.studentName || (e.status === "Check-in" ? "Check-out" : e.status) || ""}</span>
                            )}
                            {e.lessonPdfPath && (
                              <a
                                className="event-plan-link"
                                href={e.lessonPdfPath}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(x) => x.stopPropagation()}
                              >
                                Plan
                              </a>
                            )}
                          </div>
                          <button
                            className="resize-handle right"
                            onClick={(x) => x.stopPropagation()}
                            onPointerDown={(x) => beginPointerDrag(x, e, "end")}
                            aria-label="Changer la fin"
                          />
                          {e.source !== "snag" &&
                            e.source !== "maintenanceWorkOrder" && (
                            <div
                              className="event-ops"
                              onClick={(x) => x.stopPropagation()}
                              onPointerDown={(x) => x.stopPropagation()}
                            >
                              <button
                                type="button"
                                onPointerDown={(x) => x.stopPropagation()}
                                onClick={(x) => {
                                  x.stopPropagation();
                                  openOps(e, "checkin");
                                }}
                                title="Check-out"
                              >
                                OUT
                              </button>
                              <button
                                type="button"
                                onPointerDown={(x) => x.stopPropagation()}
                                onClick={(x) => {
                                  x.stopPropagation();
                                  openOps(e, "checkout");
                                }}
                                title="Check-in"
                              >
                                IN
                              </button>
                            </div>
                          )}
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
        <strong>Annulations récentes</strong>
        {cancellations.slice(0, 5).map((x) => (
          <div className="cancellation-row" key={x.id}>
            <span>{x.eventTitle}</span>
            <span>{x.reason}{x.comment ? ` — ${x.comment}` : ""}</span>
          </div>
        ))}
      </section>
      {draft && (
        <div className="modal-backdrop">
          <section
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <h2>{draft.id ? "Modifier" : "Nouvelle réservation"}</h2>
                <p>
                  {label(draft.startMinutes)} à {label(draft.endMinutes)}
                </p>
              </div>
              <button className="icon-button" onClick={() => setDraft(null)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              {renderMessage()}
              <div className="form-grid">
                <label>
                  Type
                  <select
                    value={draft.type}
                    onChange={(e) => {
                      const type = e.target.value as ActivityType;
                      const compatible = lessonOptions.some(option => option.id === draft.lessonPlanId && option.type === type);
                      setDraft({...draft, type, ...(!compatible ? {lessonPlanId:"", lessonTitle:"", lessonPdfPath:"", lessonComponentId:"", title: draft.title === draft.lessonTitle ? type : draft.title} : {})});
                    }}
                  >
                    {TYPES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(e) =>
                      setDraft({ ...draft, date: e.target.value })
                    }
                  />
                </label>
                <label>
                  Début
                  <input
                    type="time"
                    step="300"
                    value={minutesToTimeInput(draft.startMinutes)}
                    onChange={(e) => {
                      const value = timeInputToMinutes(e.target.value);
                      if (value === undefined) return;
                      setDraft({
                        ...draft,
                        startMinutes: value,
                        endMinutes: draft.endManuallyEdited
                          ? draft.endMinutes
                          : Math.min(value + 120, 24 * 60),
                      });
                    }}
                  />
                </label>
                <label>
                  Fin
                  <input
                    type="time"
                    step="300"
                    value={minutesToTimeInput(draft.endMinutes)}
                    onChange={(e) => {
                      const value = timeInputToMinutes(e.target.value);
                      if (value === undefined) return;
                      setDraft({
                        ...draft,
                        endMinutes: value,
                        endManuallyEdited: true,
                      });
                    }}
                  />
                </label>
                <label style={{position: "relative"}}>
                  Élève
                  <input
                    type="text"
                    aria-label="Rechercher un étudiant"
                    placeholder="Rechercher un étudiant…"
                    value={studentSearch || draft.studentName || ""}
                    onFocus={() => { setStudentSearch(draft.studentName || ""); setStudentSuggestOpen(true); }}
                    onChange={e => { setStudentSearch(e.target.value); setStudentSuggestOpen(true); }}
                    onBlur={() => setTimeout(() => setStudentSuggestOpen(false), 150)}
                    style={{fontSize: 16, minHeight: 44}}
                  />
                  {studentSuggestOpen && (
                    <div className="student-suggest-list">
                      <button type="button" onMouseDown={() => { setDraft({ ...draft, studentId: "", studentName: "" }); setStudentSearch(""); setStudentSuggestOpen(false); }}>Aucun</button>
                      {filteredStudents.slice(0, 8).map((s) => (
                        <button type="button" key={s.id} onMouseDown={() => { setDraft({ ...draft, studentId: s.id, studentName: s.name }); setStudentSearch(s.name); setStudentSuggestOpen(false); }}>{s.name}</button>
                      ))}
                      {!filteredStudents.length && <p>Aucun résultat.</p>}
                    </div>
                  )}
                </label>
                <label>
                  Avion
                  <select
                    value={draft.aircraftId}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        aircraftId: e.target.value,
                        resourceId: e.target.value || draft.resourceId,
                      })
                    }
                  >
                    <option value="">Aucun</option>
                    {list
                      .filter((x) => x.kind === "aircraft")
                      .map((x) => (
                        <option
                          disabled={resourceUnavailableOnDate(x, draft.date)}
                          value={x.id}
                          key={x.id}
                        >
                          {x.name}
                          {resourceUnavailableOnDate(x, draft.date)
                            ? " — INDISPONIBLE"
                            : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Instructeur
                  <select
                    value={draft.instructorId}
                    onChange={(e) =>
                      setDraft({ ...draft, instructorId: e.target.value })
                    }
                  >
                    <option value="">Aucun</option>
                    {list
                      .filter((x) => x.kind === "instructor")
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Local / simulateur
                  <select
                    value={draft.roomId}
                    onChange={(e) => {
                      const resource = list.find(
                        (x) => x.id === e.target.value,
                      );
                      setDraft({
                        ...draft,
                        roomId: e.target.value,
                        resourceId: e.target.value || draft.resourceId,
                        type:
                          resource?.kind === "simulator"
                            ? "Simulateur"
                            : draft.type,
                      });
                    }}
                  >
                    <option value="">Aucun</option>
                    {list
                      .filter(
                        (x) => x.kind === "room" || x.kind === "simulator",
                      )
                      .map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.name} — {x.detail}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Alerte retard (minutes)
                  <input
                    type="number"
                    min="0"
                    placeholder="Optionnel"
                    value={draft.overdueAlertMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        overdueAlertMinutes: e.target.value,
                      })
                    }
                  />
                </label>
              </div>
              {draft.type === "Simulateur" && (
                <label>
                  ID Transports Canada du simulateur
                  <input
                    value={draft.simulatorTcId}
                    placeholder="Ex. TC-FSTD-0000"
                    onChange={(e) =>
                      setDraft({ ...draft, simulatorTcId: e.target.value })
                    }
                  />
                </label>
              )}
              {draft.lessonPlanId && !compatibleLessonOptions.some(option => option.id === draft.lessonPlanId) && (
                <div className="notice error" role="alert">
                  Le plan actuel est incompatible avec le type d’activité sélectionné.
                  <button type="button" className="button secondary small" onClick={() => setDraft({...draft, lessonPlanId:"", lessonTitle:"", lessonPdfPath:"", lessonComponentId:""})}>Retirer le plan incompatible</button>
                </div>
              )}
              <label>
                Plan de leçon
                <select
                  value={draft.lessonPlanId}
                  onChange={(e) => {
                    const option = compatibleLessonOptions.find(
                      (item) => item.id === e.target.value,
                    );
                    setDraft({
                      ...draft,
                      lessonPlanId: e.target.value,
                      lessonTitle: option?.title || "",
                      lessonPdfPath: option?.pdfPath || "",
                      lessonComponentId: option?.componentId || "",
                      title: option?.title || draft.title,
                    });
                  }}
                >
                  <option value="">Aucun plan de leçon</option>
                  {compatibleLessonOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {Boolean(
                lessonOptions.find((item) => item.id === draft.lessonPlanId)
                  ?.cumulativeTargetHours,
              ) && (
                <div className="notice">
                  Plan cumulatif de{" "}
                  {
                    lessonOptions.find((item) => item.id === draft.lessonPlanId)
                      ?.cumulativeTargetHours
                  }{" "}
                  h — enregistrez autant de réservations que nécessaire. Ce bloc
                  sera ajouté au cumul réel lors du check-in.
                </div>
              )}
              {draft.lessonPdfPath && (
                <div className="lesson-prep-links">
                  <a
                    className="button secondary small"
                    href={draft.lessonPdfPath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir le plan PDF
                  </a>
                  {draft.studentId && (
                    <a
                      className="button secondary small"
                      href={`/ptr/${draft.studentId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir le PTR de l’élève
                    </a>
                  )}
                </div>
              )}
              <label>
                Titre
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Notes
                <textarea
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft({ ...draft, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <footer>
              {draft.id &&
                events.find((item) => item.id === draft.id)?.source !==
                  "maintenanceWorkOrder" && (
                <>
                  <button
                    className="button danger"
                    disabled={!events.some(item => item.id === draft.id && canDeleteReservation(item))}
                    title="Suppression impossible après le début ou la fin d’une activité"
                    onClick={() => {
                      const e = events.find((x) => x.id === draft.id);
                      if (!e || !canDeleteReservation(e)) return;
                      setDeleteComment(""); setDeleteError(""); setDeleteReason(REASONS[0]);
                      setDeleteEvent(e);
                      setDraft(null);
                    }}
                  >
                    Supprimer
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      const e = events.find((x) => x.id === draft.id);
                      setDraft(null);
                      if (e) void openOps(e, "checkin");
                    }}
                  >
                    Check-out
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      const e = events.find((x) => x.id === draft.id);
                      setDraft(null);
                      if (e) void openOps(e, "checkout");
                    }}
                  >
                    Check-in
                  </button>
                </>
              )}
              <span />
              <button
                className="button secondary"
                onClick={() => setDraft(null)}
              >
                Annuler
              </button>
              <button className="button" onClick={save} disabled={reservationSaving}>
                {reservationSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {ops && (
        <div className="modal-backdrop">
          <section
            className="modal checkout-modal"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <h2>
                  {ops.mode === "checkin" ? "Check-out" : "Check-in"} ·{" "}
                  {ops.event.type}
                </h2>
                <p>{ops.event.title}</p>
              </div>
              <button className="icon-button" onClick={() => setOps(null)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <label>
                Dispatch
                <input
                  value={ops.dispatch}
                  onChange={(e) => setOps({ ...ops, dispatch: e.target.value })}
                />
              </label>
              {!["Sol", "Simulateur"].includes(ops.event.type) && (
                <div className="form-grid">
                  <label>
                    Hobbs départ
                    <input
                      type="number"
                      step="0.1"
                      value={ops.hobbsStart}
                      onChange={(e) =>
                        setOps({ ...ops, hobbsStart: e.target.value })
                      }
                    />
                  </label>
                  {ops.mode === "checkout" && (
                    <>
                      <label>
                        Hobbs fin
                        <input
                          type="number"
                          step="0.1"
                          value={ops.hobbsEnd}
                          onChange={(e) =>
                            setOps({ ...ops, hobbsEnd: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Décollage
                        <input
                          type="time"
                          value={ops.takeoffTime}
                          onChange={(e) =>
                            setOps({ ...ops, takeoffTime: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Atterrissage
                        <input
                          type="time"
                          value={ops.landingTime}
                          onChange={(e) =>
                            setOps({ ...ops, landingTime: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </div>
              )}
              {ops.mode === "checkin" && (
                <label>
                  Alerte retard (minutes)
                  <input
                    type="number"
                    min="0"
                    value={ops.overdueAlertMinutes}
                    onChange={(e) =>
                      setOps({ ...ops, overdueAlertMinutes: e.target.value })
                    }
                  />
                </label>
              )}
              {usesWeather(ops.event.type) && (
                <label>
                  METAR {METAR_STATION}
                  <textarea
                    value={ops.metar}
                    placeholder={
                      metarLoading
                        ? "Récupération automatique…"
                        : "METAR automatique ou saisie manuelle"
                    }
                    onChange={(e) => setOps({ ...ops, metar: e.target.value })}
                  />
                </label>
              )}
              {ops.mode === "checkout" &&
                !["Sol", "Simulateur"].includes(ops.event.type) && (
                  <>
                    <div className="final-score">
                      <span>Airtime calculé</span>
                      <strong>
                        {airtime(ops.takeoffTime, ops.landingTime) ?? "—"} min
                      </strong>
                    </div>
                    <fieldset className="ptr-time-entry">
                      <legend>Ventilation des heures pour le PTR</legend>
                      <div className="form-grid">
                        <label>
                          Fonction à bord
                          <select
                            value={ops.flightCrewRole}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                flightCrewRole: e.target.value as
                                  | "Double"
                                  | "PIC",
                              })
                            }
                          >
                            <option value="Double">Double commande</option>
                            <option value="PIC">
                              Commandant de bord (PIC)
                            </option>
                          </select>
                        </label>
                        <label>
                          Heures de jour
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ops.dayHours}
                            onChange={(e) =>
                              setOps({ ...ops, dayHours: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Heures de nuit
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ops.nightHours}
                            onChange={(e) =>
                              setOps({ ...ops, nightHours: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Instruments en avion
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ops.instrumentAircraftHours}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                instrumentAircraftHours: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Vol-voyage de jour
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ops.crossCountryDayHours}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                crossCountryDayHours: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Vol-voyage de nuit
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={ops.crossCountryNightHours}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                crossCountryNightHours: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Route — de
                          <input
                            value={ops.routeFrom}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                routeFrom: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="CYQB"
                          />
                        </label>
                        <label>
                          Route — à
                          <input
                            value={ops.routeTo}
                            onChange={(e) =>
                              setOps({
                                ...ops,
                                routeTo: e.target.value.toUpperCase(),
                              })
                            }
                            placeholder="CYUL"
                          />
                        </label>
                      </div>
                    </fieldset>
                  </>
                )}
              {ops.mode === "checkout" &&
                ["Sol", "Simulateur"].includes(ops.event.type) && (
                  <>
                    <label>
                      {ops.event.type === "Simulateur"
                        ? "Temps simulateur"
                        : "Temps au sol"}{" "}
                      — heures décimales
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Ex. 1.5"
                        value={ops.groundTimeHours}
                        onChange={(e) =>
                          setOps({ ...ops, groundTimeHours: e.target.value })
                        }
                      />
                    </label>
                    {ops.event.type === "Simulateur" && (
                      <label>
                        Temps aux instruments FTD/DEV
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="Par défaut : temps simulateur"
                          value={ops.ftdHours}
                          onChange={(e) =>
                            setOps({ ...ops, ftdHours: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </>
                )}
            </div>
            <footer>
              <span />
              <button className="button secondary" onClick={() => setOps(null)}>
                Annuler
              </button>
              <button className="button" onClick={saveOps}>
                Enregistrer
              </button>
            </footer>
          </section>
        </div>
      )}
      {ops && opsError && (
        <div className="notice error checkout-warning-floating" role="alert">
          {opsError}
        </div>
      )}
      {deleteEvent && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <header>
              <h2>Supprimer la réservation</h2>
            </header>
            <div className="modal-body">
              {deleteError && <div className="notice error" role="alert">{deleteError}</div>}
              <label>Commentaire / motif de suppression<textarea value={deleteComment} onChange={e=>setDeleteComment(e.target.value)} /></label>
              <label>
                Raison
                <select
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                >
                  {REASONS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <footer>
              <span />
              <button
                className="button secondary"
                onClick={() => setDeleteEvent(null)}
              >
                Annuler
              </button>
              <button
                className="button danger"
                disabled={deleting || !canDeleteReservation(events.find(item=>item.id===deleteEvent.id) || deleteEvent)}
                onClick={async () => {
                  if (deleting) return;
                  setDeleting(true); setDeleteError("");
                  try {
                    await removeReservation(deleteEvent, deleteReason, deleteComment);
                    setDeleteEvent(null);
                  } catch(value) {setDeleteError(value instanceof Error ? value.message : "Suppression impossible.");}
                  finally {setDeleting(false);}
                }}
              >
                Confirmer
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
