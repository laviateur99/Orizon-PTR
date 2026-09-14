"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import{MaintenanceSectionNav}from"./MaintenanceSectionNav";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  importMaintenanceSeed,
  returnAircraftToService,
  saveMaintenanceTask,
  subscribeAircraft,
  subscribeMaintenanceHistory,
  subscribeMaintenanceTasks,
  subscribeMaintenanceWorkOrders,
  updateAircraftMaintenance,
} from "@/features/fleet/firestore";
import type {
  Aircraft,
  MaintenanceHistory,
  MaintenanceTask,
  MaintenanceWorkOrder,
} from "@/features/fleet/types";
import maintenanceSeed from "./maintenance-seed.json";
import { CalendarImportModal } from "./CalendarImportModal";
import { MaintenanceWorkOrdersPanel } from "./MaintenanceWorkOrdersPanel";
import { MaintenanceDashboard } from "./MaintenanceDashboard";
import {
  firestoreDateTimeToLocalInput,
  formatQuebecDateTime,
  quebecLocalInputToIso,
} from "@/lib/quebecDateTime";

const MAINTENANCE_VERSION = "19.28.2";
const MAINTENANCE_TABS = [
  "Résumé",
  "Travaux PRM / DOM",
  "Échéances et calendriers",
  "Journal",
] as const;
type MaintenanceTab = (typeof MAINTENANCE_TABS)[number];
const AIR_TIME_ALERT_THRESHOLD_HOURS = 15;
const ACTIVE_WORK_STATUSES = new Set([
  "En cours",
  "Travail terminé",
  "En attente de pièces",
  "Suspendue",
  "Inspection requise",
  "Inspection complétée",
  "Retour en service refusé",
]);
const effectiveStatus = (a: Aircraft): Aircraft["status"] =>
  a.status === "En maintenance" &&
  a.expectedReturnAt &&
  Date.now() > new Date(a.expectedReturnAt).getTime()
    ? "Retour en service retardé"
    : a.status;
const statusClass = (status: Aircraft["status"]) =>
  status === "Disponible"
    ? "ok"
    : status === "Maintenance planifiée"
      ? "warn"
      : "danger";
const taskRemaining = (task: MaintenanceTask, a: Aircraft) => {
  const values: string[] = [];
  if (task.dueAirTime !== undefined)
    values.push(`${(task.dueAirTime - (a.airTimeTotal || 0)).toFixed(1)} h`);
  if (task.dueDate)
    values.push(
      `${Math.ceil((new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()) / 86400000)} j`,
    );
  return values.join(" ou ") || "—";
};
type ToleranceRule = {
  hours?: number;
  months?: number;
  requiresInspection?: boolean;
  reference: string;
};
const Q0798_C152_RULES: Array<{ pattern: RegExp; rule: ToleranceRule }> = [
  {
    pattern: /^(?:prochain(?:e)? inspection )?100 (?:heures|hrs)/i,
    rule: { hours: 10, months: 1, reference: "Q-0798 REV6, tableau 1" },
  },
  {
    pattern: /^moteur$/i,
    rule: {
      hours: 100,
      requiresInspection: true,
      reference: "Q-0798 REV6, tableau 3 - O-235-L2C",
    },
  },
  {
    pattern: /^hélice$/i,
    rule: { months: 3, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /alternator/i,
    rule: { hours: 50, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /^altim[èe]tre|encoder/i,
    rule: { months: 2, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /bracket air filter/i,
    rule: {
      hours: 10,
      months: 1,
      reference: "Q-0798 REV6, tableau 3 et note 2",
    },
  },
  {
    pattern: /brake system hoses/i,
    rule: { hours: 100, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /^compas$/i,
    rule: { months: 1, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /^elt(?: |$)/i,
    rule: { months: 1, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /engine controls/i,
    rule: { hours: 100, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /engine hoses/i,
    rule: { months: 3, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /fire extinguisher|first aid kit/i,
    rule: { months: 1, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /fuel tank and screen|gyro central air filter/i,
    rule: { hours: 100, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /magneto/i,
    rule: { hours: 50, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /pitot static|transpondeur/i,
    rule: { months: 2, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /starter/i,
    rule: { hours: 50, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /tachym[èe]tre|stc\s*:/i,
    rule: { months: 1, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /trim tab actuator/i,
    rule: { hours: 100, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /vacuum relief valve filter/i,
    rule: { hours: 30, reference: "Q-0798 REV6, tableau 3" },
  },
  {
    pattern: /wheel bearing/i,
    rule: { hours: 50, reference: "Q-0798 REV6, tableau 3" },
  },
];
const Q0800_C172_RULES: Array<{ pattern: RegExp; rule: ToleranceRule }> = [
  {
    pattern: /^(?:prochain(?:e)? inspection )?(?:100|200) (?:heures|hrs)/i,
    rule: { hours: 10, reference: "Q-0800 REV8, tableau 1" },
  },
  {
    pattern: /^moteur(?: tbo \d+)?$/i,
    rule: {
      hours: 100,
      requiresInspection: true,
      reference: "Q-0800 REV8, tableau 3 - O-320/O-360",
    },
  },
  {
    pattern: /^hélice$/i,
    rule: { months: 3, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /alternator/i,
    rule: { hours: 50, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /^altim[èe]tre|encoder|pitot stati/i,
    rule: { months: 2, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /bracket air filter/i,
    rule: {
      hours: 10,
      months: 1,
      reference: "Q-0800 REV8, tableau 3 et note 2",
    },
  },
  {
    pattern: /^compas$/i,
    rule: { months: 1, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /^elt(?: |$)/i,
    rule: { months: 1, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /engine controls/i,
    rule: { hours: 100, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /engine hoses/i,
    rule: { months: 3, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern:
      /fire extinguisher|extincteur|first aid kit|fuel quantity indicator|k8 fuel indicator/i,
    rule: { months: 1, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /fuel tank and screen|k2 fuel|gyro central air filter/i,
    rule: { hours: 100, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /magn[ée]to/i,
    rule: { hours: 50, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /starter/i,
    rule: { hours: 50, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /tachym[èe]tre|^stc\b|svs 5/i,
    rule: { months: 1, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /transpondeur/i,
    rule: { months: 2, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /trim tab actuator/i,
    rule: { hours: 100, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /vacuum (?:relief valve|system air) filter|vacuum relief valve/i,
    rule: { hours: 30, reference: "Q-0800 REV8, tableau 3" },
  },
  {
    pattern: /wheel bearing/i,
    rule: { hours: 10, reference: "Q-0800 REV8, tableau 3 et note 2" },
  },
];
const Q3219_PA31_RULES: Array<{ pattern: RegExp; rule: ToleranceRule }> = [
  {
    pattern: /^100 heures inspection$/i,
    rule: { hours: 10, reference: "Q-3219 REV2, tableau 1" },
  },
  {
    pattern: /^moteur (?:gauche|droite)/i,
    rule: {
      hours: 100,
      requiresInspection: true,
      reference: "Q-3219 REV2, tableau 3 - IO/TIO-540",
    },
  },
  {
    pattern: /^h[ée]lice /i,
    rule: { hours: 100, months: 3, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /propeller gouvernor/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /alternator 500 hrs inspection/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /both altimeters|encodeur|pitot static|transpondeur/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /baffles and flapper valve/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /cabin heater .*1000|heater rear 1000/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /nylon support cords/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /boussole|compass and hsi/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /(?:density|differential) control+er/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /sa693ce element air filter|donaldson element air filter/i,
    rule: { hours: 10, months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /^elt(?: |$)/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /engine fuel and oil .*hoses|engine rubber mount/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /exhaust valve/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /extincteur|first aid kit/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /fuel cell inspection/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /fuel cell material/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /fuel injector servo|fuel pump \(m[ée]canique\)/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /hydraulic filter/i,
    rule: { hours: 10, months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /oil cooler flush|landing gear inspection/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /landing gear selector cable/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /magn[ée]to 500 heures inspection/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /pneumatic inline filter/i,
    rule: { hours: 10, months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /pneumatic inlet filter/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /starter 500 hrs inspection/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern:
      /batterie concorde capacity|sa02212ak|tachometer|tachym[èe]tre|tanis heat(?:er|her)|reiff preheater/i,
    rule: { months: 1, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /torque link assy/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /turbocharger|wastegate/i,
    rule: { hours: 100, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /valve rocker/i,
    rule: { hours: 40, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /wing flap transmission/i,
    rule: { hours: 50, reference: "Q-3219 REV2, tableau 3" },
  },
  {
    pattern: /wings? (?:\/|&) fuselage|pneumatic and flexible line/i,
    rule: { months: 3, reference: "Q-3219 REV2, tableau 3" },
  },
];
const isC152 = (a: Aircraft) => /152/i.test(`${a.model} ${a.typeLabel}`);
const isC172 = (a: Aircraft) => /172/i.test(`${a.model} ${a.typeLabel}`);
const isPA31 = (a: Aircraft) =>
  /PA-?31|Navajo/i.test(`${a.model} ${a.typeLabel}`);
const approvedTolerance = (
  task: MaintenanceTask,
  a: Aircraft,
): ToleranceRule | undefined => {
  const rules = isC152(a)
    ? Q0798_C152_RULES
    : isC172(a)
      ? Q0800_C172_RULES
      : isPA31(a)
        ? Q3219_PA31_RULES
        : undefined;
  const approved = rules?.find((item) => item.pattern.test(task.title))?.rule;
  const hours = task.toleranceHours ?? approved?.hours,
    months = task.toleranceMonths ?? approved?.months;
  return hours || months
    ? {
        hours,
        months,
        requiresInspection:
          task.toleranceRequiresInspection || approved?.requiresInspection,
        reference: approved?.reference || "Tolérance configurée",
      }
    : undefined;
};
const addMonths = (date: string, months: number) => {
  const value = new Date(`${date}T23:59:59`);
  value.setMonth(value.getMonth() + months);
  return value;
};
const taskAlertClass = (task: MaintenanceTask, a: Aircraft) => {
  if (task.notApplicable) return "not-applicable";

  const hoursRemaining =
    task.dueAirTime === undefined
      ? undefined
      : task.dueAirTime - (a.airTimeTotal || 0);

  const daysRemaining = task.dueDate
    ? Math.ceil(
        (new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()) /
          86400000,
      )
    : undefined;

  const tolerance = approvedTolerance(task, a);

  const normalExceeded =
    (hoursRemaining !== undefined && hoursRemaining < 0) ||
    (daysRemaining !== undefined && daysRemaining < 0);

  if (normalExceeded && tolerance) {
    if (tolerance.requiresInspection && !task.toleranceAuthorized) {
      return "tolerance-action";
    }

    const hoursLimitExceeded =
      hoursRemaining !== undefined && hoursRemaining < -(tolerance.hours || 0);

    const dateLimitExceeded =
      daysRemaining !== undefined &&
      Date.now() > addMonths(task.dueDate!, tolerance.months || 0).getTime();

    return hoursLimitExceeded || dateLimitExceeded
      ? "overdue"
      : "tolerance-active";
  }

  if (normalExceeded) return "overdue";

  const hoursDue =
    hoursRemaining !== undefined &&
    hoursRemaining <= AIR_TIME_ALERT_THRESHOLD_HOURS;

  const dateDue = daysRemaining !== undefined && daysRemaining <= 30;

  return hoursDue || dateDue ? "due-soon" : "";
};
const taskToleranceLabel = (task: MaintenanceTask, a: Aircraft) => {
  const rule = approvedTolerance(task, a);
  if (!rule) return "";
  return `Tolérance ${rule.hours ? `+${rule.hours} h` : ""}${rule.hours && rule.months ? " / " : ""}${rule.months ? `+${rule.months} mois` : ""}${rule.requiresInspection ? " · inspection requise" : ""}`;
};
const editableTask = (task: MaintenanceTask, a: Aircraft): MaintenanceTask => {
  const rule = approvedTolerance(task, a);
  return {
    ...task,
    toleranceHours: task.toleranceHours ?? rule?.hours,
    toleranceMonths: task.toleranceMonths ?? rule?.months,
    toleranceRequiresInspection:
      task.toleranceRequiresInspection || rule?.requiresInspection,
  };
};
const maintenanceCalendarUrl = (task: MaintenanceTask, a: Aircraft) => {
  const reference = approvedTolerance(task, a)?.reference || "";
  if (isC152(a))
    return `/docs/maintenance/q0798-rev6-cessna-152.pdf#page=${reference.includes("tableau 1") ? 4 : reference.includes("tableau 3") ? 5 : 1}`;
  if (isC172(a))
    return `/docs/maintenance/q0800-rev8-cessna-172.pdf#page=${reference.includes("tableau 1") ? 3 : reference.includes("tableau 3") ? 4 : 1}`;
  if (isPA31(a))
    return `/docs/maintenance/q3219-rev2-pa31.pdf#page=${reference.includes("tableau 1") ? 4 : reference.includes("tableau 3") ? 5 : 1}`;
  return "";
};
const MaintenanceAlertLegend = () => (
  <div className="maintenance-alert-legend">
    <span>
      <i className="due-soon" />
      Fenêtre proche
    </span>
    <span>
      <i className="tolerance-action" />
      Inspection de tolérance requise
    </span>
    <span>
      <i className="tolerance-active" />
      Tolérance active
    </span>
    <span>
      <i className="overdue" />
      Limite absolue dépassée
    </span>
    <span>
      <i className="not-applicable" />
      Non applicable
    </span>
  </div>
);
const taskUrgency = (task: MaintenanceTask, a: Aircraft) => {
  const scores: number[] = [];
  if (task.dueAirTime !== undefined)
    scores.push(
      (task.dueAirTime - (a.airTimeTotal || 0)) /
        AIR_TIME_ALERT_THRESHOLD_HOURS,
    );
  if (task.dueDate)
    scores.push(
      (new Date(`${task.dueDate}T23:59:59`).getTime() - Date.now()) /
        86400000 /
        Math.max(task.warningDays || 60, 1),
    );
  return scores.length ? Math.min(...scores) : Number.POSITIVE_INFINITY;
};
const aircraftMaintenanceUrgency = (a: Aircraft, tasks: MaintenanceTask[]) =>
  Math.min(
    ...tasks
      .filter(
        (task) =>
          task.aircraftId === a.id && !task.completed && !task.notApplicable,
      )
      .map((task) => taskUrgency(task, a)),
    Number.POSITIVE_INFINITY,
  );
const matrixTaskKey = (task: MaintenanceTask) =>
  `${task.category.trim().toLocaleLowerCase("fr-CA")}::${task.title.trim().toLocaleLowerCase("fr-CA")}`;
const maintenanceMatrixRows = (
  aircraft: Aircraft[],
  tasks: MaintenanceTask[],
) => {
  const aircraftIds = new Set(aircraft.map((item) => item.id)),
    rows = new Map<string, { key: string; title: string; category: string }>();
  tasks
    .filter((task) => aircraftIds.has(task.aircraftId) && !task.completed)
    .forEach((task) => {
      const key = matrixTaskKey(task);
      if (!rows.has(key))
        rows.set(key, { key, title: task.title, category: task.category });
    });
  return [...rows.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category, "fr-CA") ||
      a.title.localeCompare(b.title, "fr-CA"),
  );
};

export function MaintenancePage() {
  const { user, profile } = useAuth();
  const [aircraft, setAircraft] = useState<Aircraft[]>([]),
    [tasks, setTasks] = useState<MaintenanceTask[]>([]),
    [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]),
    [editing, setEditing] = useState<Aircraft | null>(null),
    [selected, setSelected] = useState<Aircraft | null>(null),
    [history, setHistory] = useState<MaintenanceHistory[]>([]),
    [reason, setReason] = useState(""),
    [editingError, setEditingError] = useState(""),
    [editingSaving, setEditingSaving] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<MaintenanceTab>("Résumé");
  const [task, setTask] = useState<MaintenanceTask | null>(null),
    [taskReason, setTaskReason] = useState(""),
    [taskError, setTaskError] = useState(""),
    [calendarImportOpen, setCalendarImportOpen] = useState(false);
  const importStarted = useRef(false);
  const canEdit =
    profile?.role === "Maintenance" ||
    profile?.role === "Directeur de maintenance" ||
    profile?.role === "Administrateur";
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("workOrderId") || params.has("snagId"))
      setActiveTab("Travaux PRM / DOM");
  }, []);
  useEffect(() => {
    const a = subscribeAircraft({
        next: setAircraft,
        error: (e) => setError(e.message),
      }),
      b = subscribeMaintenanceTasks({
        next: setTasks,
        error: (e) => setError(e.message),
      }),
      c = subscribeMaintenanceWorkOrders({
        next: setWorkOrders,
        error: (e) => setError(e.message),
      });
    return () => {
      a();
      b();
      c();
    };
  }, []);
  useEffect(() => {
    if (!canEdit || tasks.length || importStarted.current) return;
    importStarted.current = true;
    setMessage("Import des tâches du fichier Excel en cours…");
    importMaintenanceSeed(
      maintenanceSeed as {
        aircraftAirTimes: Record<string, number>;
        tasks: MaintenanceTask[];
      },
    )
      .then(() =>
        setMessage(
          `${maintenanceSeed.tasks.length} tâches de maintenance importées pour ${Object.keys(maintenanceSeed.aircraftAirTimes).length} avions.`,
        ),
      )
      .catch((value) => {
        importStarted.current = false;
        setError(
          value instanceof Error ? value.message : "Import Excel impossible.",
        );
      });
  }, [canEdit, tasks.length]);
  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    return subscribeMaintenanceHistory(selected.id, {
      next: setHistory,
      error: (e) => setError(e.message),
    });
  }, [selected]);
  const active = useMemo(
    () =>
      aircraft
        .filter((a) => a.active)
        .sort((a, b) => {
          const rank = (x: Aircraft) =>
            effectiveStatus(x) === "Retour en service retardé"
              ? 0
              : effectiveStatus(x) === "En maintenance"
                ? 1
                : effectiveStatus(x) === "Maintenance planifiée"
                  ? 2
                  : 3;
          return (
            rank(a) - rank(b) || a.registration.localeCompare(b.registration)
          );
        }),
    [aircraft],
  );
  const aircraftGroups = useMemo(
    () =>
      [
        {
          label: "C152",
          items: active
            .filter((a) => /152/i.test(`${a.model} ${a.typeLabel}`))
            .sort(
              (a, b) =>
                aircraftMaintenanceUrgency(a, tasks) -
                  aircraftMaintenanceUrgency(b, tasks) ||
                a.registration.localeCompare(b.registration),
            ),
        },
        {
          label: "C172",
          items: active
            .filter((a) => /172/i.test(`${a.model} ${a.typeLabel}`))
            .sort(
              (a, b) =>
                aircraftMaintenanceUrgency(a, tasks) -
                  aircraftMaintenanceUrgency(b, tasks) ||
                a.registration.localeCompare(b.registration),
            ),
        },
        {
          label: "PA31",
          items: active
            .filter((a) => /PA-?31|Navajo/i.test(`${a.model} ${a.typeLabel}`))
            .sort(
              (a, b) =>
                aircraftMaintenanceUrgency(a, tasks) -
                  aircraftMaintenanceUrgency(b, tasks) ||
                a.registration.localeCompare(b.registration),
            ),
        },
      ].filter((group) => group.items.length),
    [active, tasks],
  );
  const aircraftInMaintenanceCount = useMemo(
    () =>
      new Set([
        ...active
          .filter((item) => effectiveStatus(item) === "En maintenance")
          .map((item) => item.id),
        ...workOrders
          .filter((item) => ACTIVE_WORK_STATUSES.has(item.workStatus))
          .map((item) => item.aircraftId),
      ]).size,
    [active, workOrders],
  );
  const actor = {
    id: user?.uid || "",
    name: profile?.name || profile?.email || "",
    role: profile?.role || "",
  };
  const maintenanceAlerts = useMemo(() => {
    const aircraftMap = new Map(aircraft.map((a) => [a.id, a]));

    let dueSoon = 0;
    let overdue = 0;

    tasks.forEach((task) => {
      if (
        task.completed ||
        task.notApplicable ||
        task.dueAirTime === undefined
      ) {
        return;
      }

      const a = aircraftMap.get(task.aircraftId);

      if (!a) return;

      const remaining = task.dueAirTime - (a.airTimeTotal || 0);

      if (remaining <= 0) {
        overdue++;
      } else if (remaining <= AIR_TIME_ALERT_THRESHOLD_HOURS) {
        dueSoon++;
      }
    });

    return {
      dueSoon,
      overdue,
    };
  }, [tasks, aircraft]);
  function saveMaintenance() {
    if (!editing || editingSaving) return;
    setEditingError("");
    if (
      editing.status !== "Disponible" &&
      (!editing.maintenanceStartAt || !editing.expectedReturnAt)
    ) {
      setEditingError(
        "Le début et le retour prévu, avec l’heure, sont obligatoires.",
      );
      return;
    }
    if (
      editing.expectedReturnAt &&
      editing.maintenanceStartAt &&
      editing.expectedReturnAt <= editing.maintenanceStartAt
    ) {
      setEditingError("Le retour prévu doit être après le début.");
      return;
    }
    if (!reason.trim()) {
      setEditingError(
        "Inscrivez la raison de cette modification avant d’enregistrer.",
      );
      return;
    }
    const saved = {
      ...editing,
      blockedForScheduling:
        editing.status === "En maintenance" ||
        editing.status === "Hors service",
    };
    const savedReason = reason.trim(),
      previous = selected || undefined;
    setEditingSaving(true);
    setEditing(null);
    setReason("");
    setEditingError("");
    setMessage(
      "Modification enregistrée localement — synchronisation Firestore en cours…",
    );
    void updateAircraftMaintenance(saved, actor, savedReason, previous)
      .then(() =>
        setMessage(
          "Maintenance mise à jour et changement ajouté à l’historique.",
        ),
      )
      .catch((value) =>
        setError(
          `Synchronisation Firestore impossible : ${value instanceof Error ? value.message : "erreur inconnue"}`,
        ),
      )
      .finally(() => setEditingSaving(false));
  }
  async function saveTask() {
    if (!task || !selected) return;
    setTaskError("");
    if (!task.title.trim()) {
      setTaskError("Le nom de la tâche est obligatoire.");
      return;
    }
    if (!taskReason.trim()) {
      setTaskError("Inscrivez la raison du changement avant d’enregistrer.");
      return;
    }
    if (
      !task.notApplicable &&
      task.dueBasis !== "Date" &&
      (task.dueAirTime === undefined || !Number.isFinite(task.dueAirTime))
    ) {
      setTaskError("Les nouvelles heures d’échéance sont obligatoires.");
      return;
    }
    if (!task.notApplicable && task.dueBasis !== "Air Time" && !task.dueDate) {
      setTaskError("La nouvelle date d’échéance est obligatoire.");
      return;
    }
    try {
      await saveMaintenanceTask(
        task,
        actor,
        taskReason.trim(),
        selected.registration,
      );
      setTask(null);
      setTaskReason("");
      setTaskError("");
      setMessage("Échéance enregistrée et changement ajouté à l’historique.");
    } catch (value) {
      setTaskError(
        `Impossible d’enregistrer : ${value instanceof Error ? value.message : "erreur inconnue"}`,
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle={`MCM Operational Control · Version 3.5 · PRM / DOM · Module V${MAINTENANCE_VERSION} — Air Time, échéances et immobilisations`}
      />
      <MaintenanceSectionNav active="maintenance"/>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice">{message}</div>}
      <nav className="student-tabs maintenance-tabs" aria-label="Sections Maintenance">
        {MAINTENANCE_TABS.map((tabName) => (
          <button
            type="button"
            className={activeTab === tabName ? "active" : ""}
            aria-current={activeTab === tabName ? "page" : undefined}
            onClick={() => setActiveTab(tabName)}
            key={tabName}
          >
            {tabName}
          </button>
        ))}
      </nav>
      <section className="maintenance-tab-panel" hidden={activeTab !== "Résumé"}>
        <div className="fleet-kpis">
        <div className="card">
          <strong>{active.length}</strong>
          <span>Avions actifs</span>
        </div>

        <div className="card">
          <strong>
            {active.filter((a) => effectiveStatus(a) === "Disponible").length}
          </strong>
          <span>Disponibles</span>
        </div>

        <div className="card">
          <strong>{aircraftInMaintenanceCount}</strong>
          <span>En maintenance</span>
        </div>

        <div className="card">
          <strong>
            {
              active.filter(
                (a) => effectiveStatus(a) === "Retour en service retardé",
              ).length
            }
          </strong>
          <span>Retards</span>
        </div>

        <div className="card">
          <strong>{maintenanceAlerts.dueSoon}</strong>
          <span>Planification ≤{AIR_TIME_ALERT_THRESHOLD_HOURS} h</span>
        </div>

        <div className="card">
          <strong>{maintenanceAlerts.overdue}</strong>
          <span>Échéances dépassées</span>
        </div>
        </div>{" "}
        {canEdit && (
          <MaintenanceDashboard
            aircraft={aircraft}
            tasks={tasks}
            workOrders={workOrders}
          />
        )}
      </section>
      <section
        className="maintenance-tab-panel"
        hidden={activeTab !== "Travaux PRM / DOM"}
      >
        {canEdit ? (
          <MaintenanceWorkOrdersPanel
            aircraft={aircraft}
            tasks={tasks}
            actor={actor}
          />
        ) : (
          <div className="card">Accès réservé à l’équipe Maintenance.</div>
        )}
      </section>
      <section
        className="maintenance-tab-panel"
        hidden={activeTab !== "Échéances et calendriers"}
      >
        <div className="maintenance-import-bar">
        <span>
          {tasks.length} tâches surveillées provenant des fiches avion.
        </span>
        {canEdit && (
          <div className="maintenance-import-actions">
            <button
              className="button secondary"
              onClick={() => setCalendarImportOpen(true)}
            >
              Importer un calendrier PDF
            </button>
            <button
              className="button secondary"
              onClick={async () => {
                setMessage("Synchronisation Excel en cours…");
                await importMaintenanceSeed(
                  maintenanceSeed as {
                    aircraftAirTimes: Record<string, number>;
                    tasks: MaintenanceTask[];
                  },
                );
                setMessage(
                  `${maintenanceSeed.tasks.length} tâches Excel synchronisées.`,
                );
              }}
            >
              Synchroniser les tâches Excel
            </button>
          </div>
        )}
        </div>
        <div className="maintenance-aircraft-groups">
        {aircraftGroups.map((group) => {
          const rows = maintenanceMatrixRows(group.items, tasks);
          return (
            <section className="card maintenance-matrix-wrap" key={group.label}>
              <h2>
                {group.label}{" "}
                <small>
                  {group.items.length} avion{group.items.length > 1 ? "s" : ""}{" "}
                  · {rows.length} items
                </small>
              </h2>
              <div className="maintenance-matrix-scroll">
                <MaintenanceAlertLegend />
                <table className="maintenance-matrix">
                  <thead>
                    <tr>
                      <th className="maintenance-item-column">Item</th>
                      {group.items.map((a) => {
                        const status = effectiveStatus(a);
                        return (
                          <th key={a.id}>
                            <button
                              className="maintenance-aircraft-head"
                              onClick={() => setSelected(a)}
                            >
                              <strong>{a.registration}</strong>
                              <span>{(a.airTimeTotal || 0).toFixed(1)} h</span>
                              <small className={`badge ${statusClass(status)}`}>
                                {status}
                              </small>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <th className="maintenance-item-column">
                          <strong>{row.title}</strong>
                          <span>{row.category}</span>
                        </th>
                        {group.items.map((a) => {
                          const cell = tasks.find(
                            (t) =>
                              t.aircraftId === a.id &&
                              !t.completed &&
                              matrixTaskKey(t) === row.key,
                          );
                          return (
                            <td
                              className={
                                cell ? taskAlertClass(cell, a) : "empty"
                              }
                              key={a.id}
                            >
                              {cell ? (
                                <a
                                  className="maintenance-calendar-link"
                                  href={maintenanceCalendarUrl(cell, a)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Ouvrir le calendrier de maintenance approuvé par Transports Canada"
                                >
                                  <strong>
                                    {cell.notApplicable
                                      ? "N/A"
                                      : taskRemaining(cell, a)}
                                  </strong>
                                  <small>
                                    {cell.notApplicable
                                      ? "Non applicable"
                                      : taskToleranceLabel(cell, a) ||
                                        cell.dueBasis}
                                  </small>
                                  <em>Calendrier TC ↗</em>
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        </div>
      </section>
      <section
        className="maintenance-tab-panel"
        hidden={activeTab !== "Journal"}
      >
        <div id="maintenance-audit-bottom" className="maintenance-audit-bottom" />
      </section>
      {selected && (
        <div className="modal-backdrop">
          <section className="modal maintenance-detail">
            <header>
              <div>
                <h2>{selected.registration}</h2>
                <p>
                  {selected.typeLabel} · Air Time{" "}
                  {(selected.airTimeTotal || 0).toFixed(1)} h
                </p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                ×
              </button>
            </header>
            <div className="modal-body">
              <div className="maintenance-detail-actions">
                {canEdit && (
                  <>
                    <button
                      className="button"
                      onClick={() => setEditing({ ...selected })}
                    >
                      Modifier l’immobilisation
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setTaskReason("");
                        setTask({
                          id: `task-${Date.now()}`,
                          aircraftId: selected.id,
                          title: "",
                          category: "Inspection",
                          dueBasis: "Air Time",
                          warningHours: AIR_TIME_ALERT_THRESHOLD_HOURS,
                          completed: false,
                        });
                      }}
                    >
                      Ajouter une échéance
                    </button>
                    {effectiveStatus(selected) !== "Disponible" && (
                      <button
                        className="button"
                        onClick={async () => {
                          const why = window.prompt(
                            "Motif du retour en service",
                          );
                          if (!why?.trim()) return;
                          await returnAircraftToService(
                            selected,
                            actor,
                            why.trim(),
                          );
                          setSelected(null);
                        }}
                      >
                        Retour en service
                      </button>
                    )}
                  </>
                )}
              </div>
              <h3>Échéances</h3>
              <div className="maintenance-task-list">
                {tasks
                  .filter((t) => t.aircraftId === selected.id && !t.completed)
                  .map((t) => (
                    <div
                      className={`maintenance-task ${taskAlertClass(t, selected)}`}
                      key={t.id}
                    >
                      <div>
                        <strong>{t.title}</strong>
                        <span>
                          {t.category} · {t.dueBasis}
                        </span>
                      </div>
                      <div className="maintenance-task-value">
                        <div>
                          <b>
                            {t.notApplicable
                              ? "Non applicable"
                              : taskRemaining(t, selected)}
                          </b>
                          {!t.notApplicable &&
                            taskToleranceLabel(t, selected) && (
                              <small>{taskToleranceLabel(t, selected)}</small>
                            )}
                        </div>
                        {canEdit && (
                          <button
                            className="button secondary"
                            onClick={() => {
                              setTaskReason("");
                              setTask(editableTask(t, selected));
                            }}
                          >
                            Modifier
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                {!tasks.some(
                  (t) => t.aircraftId === selected.id && !t.completed,
                ) && <p>Aucune échéance configurée.</p>}
              </div>
              <h3>Historique des changements</h3>
              <div className="timeline">
                {history.map((h) => (
                  <div className="timeline-item" key={h.id}>
                    <b>{h.action}</b>
                    <span>
                      {formatQuebecDateTime(h.eventAt)} ·{" "}
                      {h.actorName} ({h.actorRole})
                    </span>
                    {h.reason && <p>{h.reason}</p>}
                    {h.expectedReturnAt && (
                      <small>
                        Retour prévu :{" "}
                        {formatQuebecDateTime(h.expectedReturnAt)}
                      </small>
                    )}
                    {h.taskId && (
                      <small>
                        {h.previousNotApplicable !== h.notApplicable
                          ? `Applicabilité : ${h.previousNotApplicable ? "non applicable" : "applicable"} → ${h.notApplicable ? "non applicable" : "applicable"} · `
                          : ""}
                        {h.previousToleranceAuthorized !== h.toleranceAuthorized
                          ? `Tolérance : ${h.previousToleranceAuthorized ? "autorisée" : "non autorisée"} → ${h.toleranceAuthorized ? "autorisée après inspection" : "non autorisée"} · `
                          : ""}
                        {h.previousDueAirTime !== undefined ||
                        h.dueAirTime !== undefined
                          ? `Heures : ${h.previousDueAirTime ?? "—"} → ${h.dueAirTime ?? "—"} h`
                          : ""}
                        {(h.previousDueAirTime !== undefined ||
                          h.dueAirTime !== undefined) &&
                        (h.previousDueDate || h.dueDate)
                          ? " · "
                          : ""}
                        {h.previousDueDate || h.dueDate
                          ? `Date : ${h.previousDueDate || "—"} → ${h.dueDate || "—"}`
                          : ""}
                      </small>
                    )}
                  </div>
                ))}
                {!history.length && <p>Aucun changement enregistré.</p>}
              </div>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop">
          <section className="modal compact" aria-busy={editingSaving}>
            <header>
              <div>
                <h2>Immobilisation — {editing.registration}</h2>
                <p>Date et heure obligatoires</p>
              </div>
              <button
                className="icon-button"
                disabled={editingSaving}
                onClick={() => {
                  setEditing(null);
                  setReason("");
                  setEditingError("");
                }}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              {editingError && (
                <div className="notice error" role="alert">
                  {editingError}
                </div>
              )}
              <label>
                Statut
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as Aircraft["status"],
                    })
                  }
                >
                  <option>Disponible</option>
                  <option>Maintenance planifiée</option>
                  <option>En maintenance</option>
                  <option>Hors service</option>
                </select>
              </label>
              <label>
                Motif
                <input
                  value={editing.maintenanceTitle || ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maintenanceTitle: e.target.value,
                      statusReason: e.target.value,
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Début
                  <input
                    type="datetime-local"
                    step="300"
                    value={firestoreDateTimeToLocalInput(
                      editing.maintenanceStartAt,
                    )}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        maintenanceStartAt: quebecLocalInputToIso(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Retour prévu
                  <input
                    type="datetime-local"
                    step="300"
                    value={firestoreDateTimeToLocalInput(
                      editing.expectedReturnAt,
                    )}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        expectedReturnAt: quebecLocalInputToIso(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Notes
                <textarea
                  value={editing.maintenanceNotes || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, maintenanceNotes: e.target.value })
                  }
                />
              </label>
              <label>
                Raison de cette modification
                <textarea
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (editingError) setEditingError("");
                  }}
                  required
                />
              </label>
            </div>
            <footer>
              <span />
              <button
                className="button secondary"
                disabled={editingSaving}
                onClick={() => {
                  setEditing(null);
                  setReason("");
                  setEditingError("");
                }}
              >
                Annuler
              </button>
              <button
                className="button"
                disabled={editingSaving}
                onClick={saveMaintenance}
              >
                {editingSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {task && (
        <div className="modal-backdrop">
          <section className="modal compact">
            <header>
              <h2>
                {tasks.some((t) => t.id === task.id)
                  ? "Modifier l’échéance"
                  : "Nouvelle échéance"}
              </h2>
              <button
                className="icon-button"
                onClick={() => {
                  setTask(null);
                  setTaskReason("");
                  setTaskError("");
                }}
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              {taskError && (
                <div className="notice error" role="alert">
                  {taskError}
                </div>
              )}
              <label>
                Tâche
                <input
                  value={task.title}
                  onChange={(e) => setTask({ ...task, title: e.target.value })}
                />
              </label>
              <label>
                Catégorie
                <input
                  value={task.category}
                  onChange={(e) =>
                    setTask({ ...task, category: e.target.value })
                  }
                />
              </label>
              <label className="maintenance-applicability">
                <input
                  type="checkbox"
                  checked={task.notApplicable === true}
                  onChange={(e) =>
                    setTask({ ...task, notApplicable: e.target.checked })
                  }
                />
                <span>
                  <strong>Non applicable à cet avion</strong>
                  <small>
                    Ne pas suivre les heures ni la durée pour cet item.
                  </small>
                </span>
              </label>
              {!task.notApplicable && (
                <>
                  <label>
                    Base
                    <select
                      value={task.dueBasis}
                      onChange={(e) =>
                        setTask({
                          ...task,
                          dueBasis: e.target
                            .value as MaintenanceTask["dueBasis"],
                        })
                      }
                    >
                      <option>Air Time</option>
                      <option>Date</option>
                      <option>Air Time et date</option>
                    </select>
                  </label>
                  {task.dueBasis !== "Date" && (
                    <label>
                      Nouvelles heures d’échéance
                      <input
                        type="number"
                        step="0.1"
                        value={task.dueAirTime ?? ""}
                        onChange={(e) =>
                          setTask({
                            ...task,
                            dueAirTime:
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  )}
                  {task.dueBasis !== "Air Time" && (
                    <label>
                      Nouvelle date d’échéance
                      <input
                        type="date"
                        value={task.dueDate || ""}
                        onChange={(e) =>
                          setTask({
                            ...task,
                            dueDate: e.target.value || undefined,
                          })
                        }
                      />
                    </label>
                  )}
                </>
              )}
              {selected && approvedTolerance(task, selected) && (
                <div className="maintenance-tolerance-panel">
                  <strong>
                    Fenêtre approuvée -{" "}
                    {approvedTolerance(task, selected)?.reference}
                  </strong>
                  <span>{taskToleranceLabel(task, selected)}</span>
                  {approvedTolerance(task, selected)?.requiresInspection && (
                    <label className="maintenance-applicability">
                      <input
                        type="checkbox"
                        checked={task.toleranceAuthorized === true}
                        onChange={(e) =>
                          setTask({
                            ...task,
                            toleranceAuthorized: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>Inspection de tolérance effectuée</strong>
                        <small>
                          Autorise l’utilisation de la tolérance. La raison et
                          l’auteur seront consignés dans l’historique.
                        </small>
                      </span>
                    </label>
                  )}
                </div>
              )}
              <label>
                Raison du changement
                <textarea
                  value={taskReason}
                  onChange={(e) => {
                    setTaskReason(e.target.value);
                    if (taskError) setTaskError("");
                  }}
                  required
                />
              </label>
            </div>
            <footer>
              <span />
              <button
                className="button secondary"
                onClick={() => {
                  setTask(null);
                  setTaskReason("");
                  setTaskError("");
                }}
              >
                Annuler
              </button>
              <button className="button" onClick={saveTask}>
                Enregistrer
              </button>
            </footer>
          </section>
        </div>
      )}
      {calendarImportOpen && (
        <CalendarImportModal
          aircraft={aircraft}
          tasks={tasks}
          actor={actor}
          onClose={() => setCalendarImportOpen(false)}
          onComplete={setMessage}
        />
      )}{" "}
    </>
  );
}
