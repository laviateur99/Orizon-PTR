"use client";

import { useAuth } from "@/features/auth/AuthProvider";
import { PersonPinPanel } from "@/features/auth/PersonPinPanel";

/** NIP de certification d'un technicien OMA : seul le technicien lui-même peut le définir (compte = uid). */
export function TechnicianPinPanel({ userId, userName }: { userId: string; userName: string }) {
  const { profile } = useAuth();
  return <PersonPinPanel kind="technician" personId={userId} personName={userName} isSelf={profile?.uid === userId} />;
}
