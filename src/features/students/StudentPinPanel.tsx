"use client";

import { useAuth } from "@/features/auth/AuthProvider";
import { PersonPinPanel } from "@/features/auth/PersonPinPanel";

export function StudentPinPanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { profile } = useAuth();
  const isSelf = profile?.role === "Étudiant" && profile.linkedStudentId === studentId;
  return <PersonPinPanel kind="student" personId={studentId} personName={studentName} isSelf={isSelf} />;
}
