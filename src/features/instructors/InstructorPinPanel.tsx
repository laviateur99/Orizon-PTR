"use client";

import { useAuth } from "@/features/auth/AuthProvider";
import { PersonPinPanel } from "@/features/auth/PersonPinPanel";

export function InstructorPinPanel({ instructorId, instructorName }: { instructorId: string; instructorName: string }) {
  const { profile } = useAuth();
  const isSelf = profile?.role === "Instructeur" && profile.linkedInstructorId === instructorId;
  return <PersonPinPanel kind="instructor" personId={instructorId} personName={instructorName} isSelf={isSelf} />;
}
