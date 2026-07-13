"use client";
import { Student, Flight, TrainingNote, Instructor, Cohort, Aircraft, Reservation } from "./types";
import { seedStudents, seedFlights, seedNotes, seedInstructors, seedCohorts, seedAircraft, seedReservations } from "./seed";

const S="orizon_ptr_students_v3",F="orizon_ptr_flights_v3",N="orizon_ptr_notes_v3",I="orizon_ptr_instructors_v3",C="orizon_ptr_cohorts_v3",A="orizon_ptr_aircraft_v3",R="orizon_ptr_reservations_v3";
export const slugify=(v:string)=>v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
function read<T>(key:string, seed:T[]):T[]{if(typeof window==="undefined")return seed;const raw=localStorage.getItem(key);if(!raw){localStorage.setItem(key,JSON.stringify(seed));return seed}return JSON.parse(raw)}
function write<T>(key:string, value:T[]){localStorage.setItem(key,JSON.stringify(value))}

export const getInstructors=()=>read<Instructor>(I,seedInstructors);
export function getInstructor(id?:string){return getInstructors().find(i=>i.id===id)}
export function addInstructor(input:Omit<Instructor,"id"|"active">){const item={...input,id:slugify(`${input.firstName}-${input.lastName}-${Date.now()}`),active:true};write(I,[item,...getInstructors()]);return item}

export const getCohorts=()=>read<Cohort>(C,seedCohorts);
export function getCohort(id?:string){return getCohorts().find(c=>c.id===id)}
export function addCohort(input:Omit<Cohort,"id">){const item={...input,id:slugify(`${input.name}-${Date.now()}`)};write(C,[item,...getCohorts()]);return item}

export const getAircraft=()=>read<Aircraft>(A,seedAircraft);
export function getAircraftById(id?:string){return getAircraft().find(a=>a.id===id)}
export function addAircraft(input:Omit<Aircraft,"id">){const item={...input,id:slugify(`${input.registration}-${Date.now()}`)};write(A,[item,...getAircraft()]);return item}
export function updateAircraftStatus(id:string,status:Aircraft["status"]){write(A,getAircraft().map(a=>a.id===id?{...a,status}:a))}

export const getStudents=()=>read<Student>(S,seedStudents);
export function getStudent(id:string){return getStudents().find(s=>s.id===id)}
export function addStudent(input:Omit<Student,"id"|"progress"|"total"|"dual"|"solo"|"instrument">){const instructor=getInstructor(input.instructorId);const student={...input,instructor:instructor?`${instructor.firstName} ${instructor.lastName}`:input.instructor,id:slugify(`${input.firstName}-${input.lastName}-${Date.now()}`),progress:0,total:0,dual:0,solo:0,instrument:0};write(S,[student,...getStudents()]);return student}
export function updateStudentAssignments(studentId:string,instructorId?:string,cohortId?:string){const instructor=getInstructor(instructorId);write(S,getStudents().map(s=>s.id===studentId?{...s,instructorId,instructor:instructor?`${instructor.firstName} ${instructor.lastName}`:s.instructor,cohortId}:s))}

export const getReservations=()=>read<Reservation>(R,seedReservations);
export function addReservation(input:Omit<Reservation,"id">){
  const reservations=getReservations();
  const conflicts=reservations.filter(r=>r.date===input.date && r.status!=="Annulé" && overlaps(r.startTime,r.endTime,input.startTime,input.endTime));
  const aircraftConflict=conflicts.find(r=>r.aircraftId===input.aircraftId);
  const instructorConflict=input.instructorId?conflicts.find(r=>r.instructorId===input.instructorId):undefined;
  const studentConflict=conflicts.find(r=>r.studentId===input.studentId);
  const aircraft=getAircraftById(input.aircraftId);
  if(aircraft?.status!=="Disponible" && input.type!=="Maintenance") throw new Error("Cet avion n'est pas disponible.");
  if(aircraftConflict) throw new Error("Conflit : cet avion est déjà réservé.");
  if(instructorConflict && input.type==="Double commande") throw new Error("Conflit : cet instructeur est déjà réservé.");
  if(studentConflict) throw new Error("Conflit : cet étudiant a déjà une réservation.");
  const item={...input,id:`reservation-${Date.now()}`};
  write(R,[item,...reservations]);
  return item;
}
export function overlaps(s1:string,e1:string,s2:string,e2:string){return s1<e2 && s2<e1}

export const getFlights=()=>read<Flight>(F,seedFlights);
export function addFlight(input:Omit<Flight,"id">){const instructor=getInstructor(input.instructorId);const aircraft=getAircraftById(input.aircraftId);const flight={...input,aircraft:aircraft?.type||input.aircraft,registration:aircraft?.registration||input.registration,instructor:instructor?`${instructor.firstName} ${instructor.lastName}`:input.instructor,id:`flight-${Date.now()}`};write(F,[flight,...getFlights()]);write(S,getStudents().map(s=>s.id!==input.studentId?s:{...s,total:+(s.total+input.duration).toFixed(1),dual:+(s.dual+input.dual).toFixed(1),solo:+(s.solo+input.solo).toFixed(1),instrument:+(s.instrument+input.instrument).toFixed(1),lastFlight:input.date}));return flight}

export const getNotes=()=>read<TrainingNote>(N,seedNotes);
export function addNote(input:Omit<TrainingNote,"id">){const note={...input,id:`note-${Date.now()}`};write(N,[note,...getNotes()]);return note}


export function saveReservations(items: Reservation[]) {
  write(R, items);
}

export function updateReservation(id: string, patch: Partial<Reservation>) {
  const reservations = getReservations().map((r) => r.id === id ? { ...r, ...patch } : r);
  write(R, reservations);
}

export function deleteReservation(id: string) {
  write(R, getReservations().filter((r) => r.id !== id));
}

export function moveReservation(id: string, minutesDelta: number) {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const toTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const reservations = getReservations().map((r) => {
    if (r.id !== id) return r;
    return {
      ...r,
      startTime: toTime(toMinutes(r.startTime) + minutesDelta),
      endTime: toTime(toMinutes(r.endTime) + minutesDelta),
    };
  });
  write(R, reservations);
}

export function resizeReservation(id: string, minutesDelta: number) {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const toTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const reservations = getReservations().map((r) => {
    if (r.id !== id) return r;
    const newEnd = Math.max(toMinutes(r.startTime) + 30, toMinutes(r.endTime) + minutesDelta);
    return { ...r, endTime: toTime(newEnd) };
  });
  write(R, reservations);
}
