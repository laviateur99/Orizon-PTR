export type PTRLessonStatus = "Non commencé" | "En cours" | "Réussi" | "À reprendre";
export type TCScore = 1 | 2 | 3 | 4;

export type PTRLesson = {
  id: string;
  studentId: string;
  phase: string;
  lessonNumber: string;
  title: string;
  objective: string;
  exercises: string[];
  status: PTRLessonStatus;
  linkedReservationId: string;
  updatedAt?: string;
};

export type PTREvaluation = {
  id: string;
  studentId: string;
  lessonId: string;
  reservationId: string;
  instructorId: string;
  instructorName: string;
  date: string;
  pilotage?: TCScore;
  technical?: TCScore;
  situationalAwareness?: TCScore;
  flightManagement?: TCScore;
  safetyMargins?: TCScore;
  finalScore?: TCScore;
  strengths: string;
  improvements: string;
  comments: string;
  actions: string[];
  lessonStatus: PTRLessonStatus;
  instructorSignature: string;
  studentSignature: string;
  signedAt: string;
};

export type ReservationOption = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  type: string;
  instructorId: string;
};

export type InstructorOption = { id: string; name: string };
