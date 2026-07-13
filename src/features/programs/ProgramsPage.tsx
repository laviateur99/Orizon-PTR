"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ATPA_PROGRAM } from "./data";

export function ProgramsPage() {
  const [phase, setPhase] = useState(1);
  const lessons = useMemo(
    () => ATPA_PROGRAM.lessons.filter(item => item.phase === phase),
    [phase]
  );

  return (
    <>
      <PageHeader
        title="Programmes de formation"
        subtitle="Bibliothèque officielle des plans de leçon d’Orizon Aviation"
      />

      <section className="card program-hero">
        <div>
          <span className="badge ok">Programme officiel importé</span>
          <h2>{ATPA_PROGRAM.name}</h2>
          <p>{ATPA_PROGRAM.source}</p>
          <p className="muted">
            {ATPA_PROGRAM.lessonCount} leçons · {ATPA_PROGRAM.componentCount} composantes de formation · entrée en vigueur {ATPA_PROGRAM.effectiveDate}
          </p>
        </div>
        <div className="program-stat">
          <strong>{ATPA_PROGRAM.lessonCount}</strong>
          <span>leçons structurées</span>
        </div>
      </section>

      <div className="program-layout">
        <aside className="card program-phases">
          <h3>Phases</h3>
          {ATPA_PROGRAM.phases.map(item => (
            <button
              key={item.number}
              className={phase === item.number ? "active" : ""}
              onClick={() => setPhase(item.number)}
            >
              <strong>Phase {item.number}</strong>
              <span>{item.name}</span>
            </button>
          ))}
        </aside>

        <main className="program-lessons">
          {lessons.map(lesson => (
            <article className="card program-lesson-card" key={lesson.number}>
              <header>
                <div>
                  <span className="badge">Leçon {lesson.number}</span>
                  <h3>{lesson.title}</h3>
                </div>
                <span className="muted">{lesson.components.length} composante(s)</span>
              </header>

              {lesson.objectives.length > 0 && (
                <>
                  <h4>Objectifs</h4>
                  <ul>{lesson.objectives.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </>
              )}

              <div className="component-grid">
                {lesson.components.map((component, index) => (
                  <section className="program-component" key={`${component.modality}-${index}`}>
                    <div className="component-head">
                      <strong>{component.modality}</strong>
                      <span>Page {component.manualPage}</span>
                    </div>
                    <p><b>{component.category}</b> · {component.title}</p>
                    <div className="hours">
                      {component.hours.sol > 0 && <span>Sol {component.hours.sol} h</span>}
                      {component.hours.dev > 0 && <span>DEV {component.hours.dev} h</span>}
                      {component.hours.doubleCommande > 0 && <span>DC {component.hours.doubleCommande} h</span>}
                      {component.hours.solo > 0 && <span>Solo {component.hours.solo} h</span>}
                    </div>
                    {component.successCriteria && (
                      <p className="success-criteria"><b>Norme :</b> {component.successCriteria}</p>
                    )}
                  </section>
                ))}
              </div>
            </article>
          ))}
        </main>
      </div>
    </>
  );
}
