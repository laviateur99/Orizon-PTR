"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { subscribeStudents } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";

export function PtrPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");

  useEffect(() => subscribeStudents({
    next: setStudents,
    error: value => setError(value.message)
  }), []);

  return (
    <>
      <PageHeader title="PTR électronique" subtitle="Leçons, évaluations Transports Canada, commentaires et signatures" />
      {error && <div className="notice error">{error}</div>}
      <div className="ptr-student-grid">
        {students.map(student => (
          <Card key={student.id}>
            <h3>{student.firstName} {student.lastName}</h3>
            <p className="muted">{student.program} · {student.programType}</p>
            <a className="button" href={`/ptr/${student.id}`}>Ouvrir le PTR</a>
          </Card>
        ))}
        {!students.length && <Card><p>Aucun étudiant disponible.</p></Card>}
      </div>
    </>
  );
}
