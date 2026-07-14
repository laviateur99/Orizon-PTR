"use client";

import { useEffect, useMemo, useState } from "react";
import { ATPA_PROGRAM } from "@/features/programs/data";
import { saveProfessionalEvaluation } from "./firestore";
import type {
  InstructorOption,
  PTREvaluation,
  PTRLesson,
  ReservationOption,
  TCScore
} from "./types";

type ItemState = {
  label: string;
  score: TCScore | 0;
  notSeen: boolean;
  comment: string;
};

function lessonNumberFromPlanId(value?: string) {
  const match = value?.match(/L(\d+)/);
  return match ? Number(match[1]) : null;
}

export function ProfessionalLessonEvaluation({
  studentId,
  lesson,
  reservations,
  instructors,
  onSaved
}: {
  studentId: string;
  lesson: PTRLesson;
  reservations: ReservationOption[];
  instructors: InstructorOption[];
  onSaved: () => void;
}) {
  const lessonNumber =
    lessonNumberFromPlanId(lesson.lessonPlanId) ||
    Number(String(lesson.lessonNumber).replace(/\D/g, "")) ||
    null;

  const programLesson = ATPA_PROGRAM.lessons.find(
    item => item.number === lessonNumber
  );

  const evaluationItems = useMemo(() => {
    const values =
      programLesson?.evaluationItems ||
      programLesson?.components.flatMap(
        component => component.evaluationItems || []
      ) ||
      [];
    return Array.from(new Set(values));
  }, [programLesson]);

  const [items, setItems] = useState<ItemState[]>([]);
  const [instructorId, setInstructorId] = useState("");
  const [reservationId, setReservationId] = useState(
    lesson.linkedReservationId || ""
  );
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [homework, setHomework] = useState("");
  const [instructorSignature, setInstructorSignature] = useState("");
  const [studentSignature, setStudentSignature] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setItems(
      evaluationItems.map(label => ({
        label,
        score: 0,
        notSeen: false,
        comment: ""
      }))
    );
  }, [evaluationItems]);

  useEffect(() => {
    setReservationId(lesson.linkedReservationId || "");
  }, [lesson.linkedReservationId]);

  const scoredItems = items.filter(item => !item.notSeen && item.score > 0);
  const finalScore = scoredItems.length
    ? (Math.min(...scoredItems.map(item => item.score)) as TCScore)
    : 1;
  const averageScore = scoredItems.length
    ? Number(
        (
          scoredItems.reduce((sum, item) => sum + item.score, 0) /
          scoredItems.length
        ).toFixed(2)
      )
    : 0;

  function updateItem(
    index: number,
    patch: Partial<ItemState>
  ) {
    setItems(current =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  async function save() {
    const instructor = instructors.find(item => item.id === instructorId);

    if (!instructor) {
      setMessage("Sélectionne l’instructeur.");
      return;
    }
    if (!items.length) {
      setMessage("Aucun élément d’évaluation n’a été trouvé dans ce plan.");
      return;
    }
    if (items.some(item => !item.notSeen && item.score === 0)) {
      setMessage("Chaque élément doit être noté ou marqué Non vu.");
      return;
    }
    if (!instructorSignature.trim()) {
      setMessage("La signature de l’instructeur est obligatoire.");
      return;
    }

    await saveProfessionalEvaluation(lesson, {
      lessonId: lesson.id,
      studentId,
      reservationId,
      instructorId,
      instructorName: instructor.name,
      date: new Date().toISOString().slice(0, 10),
      items: items.map((item, index) => ({
        id: `${lesson.id}-${index + 1}`,
        ...item
      })),
      finalScore,
      averageScore,
      weakItems: items
        .filter(item => !item.notSeen && item.score > 0 && item.score <= 2)
        .map(item => item.label),
      unseenItems: items
        .filter(item => item.notSeen)
        .map(item => item.label),
      strengths,
      improvements,
      homework,
      instructorSignature,
      studentSignature,
      signedAt: new Date().toISOString()
    });

    setMessage("Évaluation enregistrée dans le PTR.");
    onSaved();
  }

  return (
    <section className="card professional-evaluation">
      <header className="professional-evaluation-head">
        <div>
          <h2>Évaluation détaillée de la leçon</h2>
          <p>
            Chaque élément provient de la colonne de gauche du plan de leçon officiel.
          </p>
        </div>
        <div className="evaluation-score-summary">
          <span>Note finale</span>
          <strong>{finalScore}</strong>
          <small>Moyenne {averageScore || "—"}</small>
        </div>
      </header>

      <div className="form-grid">
        <label>
          Instructeur
          <select
            value={instructorId}
            onChange={event => setInstructorId(event.target.value)}
          >
            <option value="">Sélectionner</option>
            {instructors.map(item => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Vol lié
          <select
            value={reservationId}
            onChange={event => setReservationId(event.target.value)}
          >
            <option value="">Aucun vol lié</option>
            {reservations.map(item => (
              <option value={item.id} key={item.id}>
                {item.date} · {item.startTime}-{item.endTime} · {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lesson.lessonPdfPath && (
        <div className="lesson-pdf-actions">
          <a
            className="button secondary"
            href={lesson.lessonPdfPath}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir le plan original PDF
          </a>
        </div>
      )}

      <div className="evaluation-items-table">
        <div className="evaluation-items-head">
          <span>Élément du plan</span>
          <span>Non vu</span>
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <span>4</span>
          <span>Commentaire</span>
        </div>

        {items.map((item, index) => (
          <div className="evaluation-item-row" key={`${item.label}-${index}`}>
            <strong>{item.label}</strong>

            <label className="score-choice not-seen">
              <input
                type="checkbox"
                checked={item.notSeen}
                onChange={event =>
                  updateItem(index, {
                    notSeen: event.target.checked,
                    score: event.target.checked ? 0 : item.score
                  })
                }
              />
              <span>NV</span>
            </label>

            {([1, 2, 3, 4] as TCScore[]).map(score => (
              <button
                type="button"
                key={score}
                className={
                  !item.notSeen && item.score === score
                    ? "score-button active"
                    : "score-button"
                }
                disabled={item.notSeen}
                onClick={() => updateItem(index, { score })}
              >
                {score}
              </button>
            ))}

            <input
              value={item.comment}
              onChange={event =>
                updateItem(index, { comment: event.target.value })
              }
              placeholder="Commentaire"
            />
          </div>
        ))}
      </div>

      {!items.length && (
        <div className="notice error">
          Aucun élément n’a été extrait pour cette leçon.
        </div>
      )}

      <div className="professional-comments">
        <label>
          Points forts
          <textarea
            value={strengths}
            onChange={event => setStrengths(event.target.value)}
          />
        </label>
        <label>
          Points à améliorer
          <textarea
            value={improvements}
            onChange={event => setImprovements(event.target.value)}
          />
        </label>
        <label>
          Travail à faire / préparation
          <textarea
            value={homework}
            onChange={event => setHomework(event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid">
        <label>
          Signature instructeur
          <input
            value={instructorSignature}
            onChange={event =>
              setInstructorSignature(event.target.value)
            }
          />
        </label>
        <label>
          Signature élève
          <input
            value={studentSignature}
            onChange={event =>
              setStudentSignature(event.target.value)
            }
          />
        </label>
      </div>

      {message && <div className="notice">{message}</div>}

      <button className="button" onClick={save}>
        Enregistrer l’évaluation dans le PTR
      </button>
    </section>
  );
}
