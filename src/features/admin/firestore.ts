import {
  collection, doc, getDocs, serverTimestamp, setDoc, writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { inviteUser } from "@/features/auth/inviteUser";
import { hashPin, randomPinSalt } from "@/features/auth/pin";

const BATCH_LIMIT = 450;

async function commitInChunks(references: DocumentReference[], action: "delete" | "resetHours") {
  for (let start = 0; start < references.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    references.slice(start, start + BATCH_LIMIT).forEach(reference => {
      if (action === "delete") batch.delete(reference);
      else batch.set(reference, {
        flightHours: 0, groundHours: 0, simulatorHours: 0,
        dualHours: 0, soloHours: 0, updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
}

async function referencesFor(collectionName: string) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map(item => item.ref);
}

export async function resetStudentHours() {
  const students = await referencesFor("students");
  await commitInChunks(students, "resetHours");
  return students.length;
}

export async function resetStudentTrainingRecords() {
  const collections = ["ptrLessons", "ptrEvaluations", "studentHistory", "studentNotes", "studentDocuments"];
  let deleted = 0;
  for (const collectionName of collections) {
    const references = await referencesFor(collectionName);
    await commitInChunks(references, "delete");
    deleted += references.length;
  }
  const students = await resetStudentHours();
  return { deleted, students };
}

export async function resetTestEnvironment() {
  const collections = ["reservations", "cancellations", "ptrLessons", "ptrEvaluations", "studentHistory", "studentNotes"];
  let deleted = 0;
  for (const collectionName of collections) {
    const references = await referencesFor(collectionName);
    await commitInChunks(references, "delete");
    deleted += references.length;
  }
  const students = await resetStudentHours();
  return { deleted, students };
}

export async function createTestData() {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const students = [
    { id: "demo-jean-tremblay", firstName: "Jean", lastName: "Tremblay" },
    { id: "demo-sophie-gagnon", firstName: "Sophie", lastName: "Gagnon" },
    { id: "demo-marc-dubois", firstName: "Marc", lastName: "Dubois" },
  ];
  const batch = writeBatch(db);
  students.forEach(student => batch.set(doc(db, "students", student.id), {
    ...student, name: `${student.firstName} ${student.lastName}`,
    email: "", phone: "", address: "", emergencyContact: "", emergencyPhone: "",
    program: "ATP(A) intégré", programType: "Intégré", language: "Français",
    status: "Actif", primaryInstructorId: "", startDate: date,
    flightHours: 0, groundHours: 0, simulatorHours: 0,
    notes: "Donnée de démonstration v19", isTestData: true,
    updatedAt: serverTimestamp(),
  }, { merge: true }));
  const reservations = [
    { id: "demo-v19-1", student: students[0], resourceId: "c-gabc", type: "Double commande", startMinutes: 480, endMinutes: 570, title: "Leçon de démonstration" },
    { id: "demo-v19-2", student: students[1], resourceId: "c-gxyz", type: "Solo", startMinutes: 600, endMinutes: 660, title: "Circuits de démonstration" },
    { id: "demo-v19-3", student: students[2], resourceId: "briefing", type: "Sol", startMinutes: 780, endMinutes: 840, title: "Briefing de démonstration" },
  ];
  reservations.forEach(item => batch.set(doc(db, "reservations", item.id), {
    date, resourceId: item.resourceId, studentId: item.student.id,
    studentName: `${item.student.firstName} ${item.student.lastName}`,
    type: item.type, startMinutes: item.startMinutes, endMinutes: item.endMinutes,
    title: item.title, status: "Planifié", isTestData: true,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await batch.commit();
  return { students: students.length, reservations: reservations.length };
}

const localDateDaysAgo=(days:number)=>{
  const value=new Date();
  value.setHours(12,0,0,0);
  value.setDate(value.getDate()-days);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
};

export async function createPayrollTestData(){
  const instructors=[
    {id:"demo-payroll-instructor-a",firstName:"Alex",lastName:"Lavoie",email:"alex.lavoie.test@orizon.demo",employeeNumber:"TEST-PAIE-01",classLevel:"Classe 2"},
    {id:"demo-payroll-instructor-b",firstName:"Camille",lastName:"Bérubé",email:"camille.berube.test@orizon.demo",employeeNumber:"TEST-PAIE-02",classLevel:"Classe 3"}
  ];
  const students=[
    {id:"demo-payroll-student-1",firstName:"Émile",lastName:"Roy"},
    {id:"demo-payroll-student-2",firstName:"Léa",lastName:"Fortin"},
    {id:"demo-payroll-student-3",firstName:"Noah",lastName:"Gagnon"},
    {id:"demo-payroll-student-4",firstName:"Chloé",lastName:"Pelletier"}
  ];
  const batch=writeBatch(db);
  instructors.forEach(item=>batch.set(doc(db,"instructors",item.id),{
    ...item,name:`${item.firstName} ${item.lastName}`,phone:"",status:"Actif",active:true,
    hiredDate:localDateDaysAgo(90),notes:"Instructeur fictif — vérification des feuilles de temps",isTestData:true,updatedAt:serverTimestamp()
  },{merge:true}));
  students.forEach(item=>batch.set(doc(db,"students",item.id),{
    ...item,name:`${item.firstName} ${item.lastName}`,email:"",phone:"",address:"",emergencyContact:"",emergencyPhone:"",
    program:"ATP(A) modulaire — démonstration",programType:"Modulaire",language:"Français",status:"Actif",
    primaryInstructorId:instructors[Number(item.id.slice(-1))%2].id,startDate:localDateDaysAgo(30),flightHours:0,groundHours:0,simulatorHours:0,
    notes:"Étudiant fictif — essais de paie",isTestData:true,updatedAt:serverTimestamp()
  },{merge:true}));
  const completed=(id:string,instructorIndex:number,studentIndex:number,daysAgo:number,type:string,hours:number,title:string,extra:Record<string,unknown>={})=>{
    const instructor=instructors[instructorIndex],student=students[studentIndex],startMinutes=540;
    batch.set(doc(db,"reservations",id),{
      date:localDateDaysAgo(daysAgo),resourceId:instructor.id,instructorId:instructor.id,studentId:student.id,
      studentName:`${student.firstName} ${student.lastName}`,type,startMinutes,endMinutes:startMinutes+Math.round(hours*60),title,
      status:"Complété",checkedInBy:"Données de démonstration",checkedOutBy:"Données de démonstration",
      checkedInAt:`${localDateDaysAgo(daysAgo)}T09:00:00`,checkedOutAt:`${localDateDaysAgo(daysAgo)}T12:00:00`,
      isTestData:true,payrollTestData:true,...extra,updatedAt:serverTimestamp(),createdAt:serverTimestamp()
    },{merge:true});
  };
  completed("demo-payroll-a-flight-1",0,0,13,"Double commande",1.2,"Vol — exercices en altitude",{dayHours:1.2,flightCrewRole:"Double"});
  completed("demo-payroll-a-ground",0,0,12,"Sol",1,"Sol préparatoire — exercices en altitude",{groundTimeHours:1});
  completed("demo-payroll-a-flight-2",0,1,10,"Double commande",1.5,"Vol — circuits",{dayHours:1.5,flightCrewRole:"Double"});
  completed("demo-payroll-a-theory",0,0,8,"Sol",2,"Théorie — météorologie",{groundTimeHours:2,theoreticalSessionId:"demo-payroll-theory-a"});
  completed("demo-payroll-a-flight-3",0,0,6,"Double commande",0.9,"Vol de nuit — circuits",{nightHours:0.9,flightCrewRole:"Double"});
  completed("demo-payroll-a-sim",0,1,4,"Simulateur",1.5,"Simulateur — procédures IFR",{groundTimeHours:1.5,ftdHours:1.5});
  completed("demo-payroll-a-flight-4",0,1,2,"Double commande",1.4,"Vol — navigation",{dayHours:1.4,crossCountryDayHours:1.4,flightCrewRole:"Double"});
  completed("demo-payroll-b-flight-1",1,2,12,"Double commande",1,"Vol — maniabilité",{dayHours:1,flightCrewRole:"Double"});
  completed("demo-payroll-b-theory",1,2,11,"Sol",3,"Théorie — navigation",{groundTimeHours:3,theoreticalSessionId:"demo-payroll-theory-b"});
  completed("demo-payroll-b-flight-2",1,3,9,"Double commande",1.1,"Vol — décrochages",{dayHours:1.1,flightCrewRole:"Double"});
  completed("demo-payroll-b-ground",1,3,7,"Sol",0.7,"Sol préparatoire — décrochages",{groundTimeHours:0.7});
  completed("demo-payroll-b-sim",1,2,5,"Simulateur",2,"Simulateur — approches",{groundTimeHours:2,ftdHours:2});
  completed("demo-payroll-b-flight-3",1,3,1,"Double commande",1.3,"Vol de nuit — navigation",{nightHours:1.3,crossCountryNightHours:1.3,flightCrewRole:"Double"});
  batch.set(doc(db,"employeeLeaves","demo-payroll-camille-pending-vacation"),{
    employeeId:instructors[1].id,employeeName:`${instructors[1].firstName} ${instructors[1].lastName}`,employeeRole:"Instructeur",
    type:"Vacances",startDate:localDateDaysAgo(-3),endDate:localDateDaysAgo(-3),hoursPerDay:8,status:"En attente",
    notes:"Exemple — demande de vacances à approuver",requestedBy:instructors[1].id,requestedAt:new Date().toISOString(),
    isTestData:true,updatedAt:serverTimestamp(),createdAtServer:serverTimestamp()
  },{merge:true});
  await batch.commit();
  return{instructors:instructors.length,students:students.length,reservations:13,leaveRequests:1};
}

export async function createStudentAccountsAndPins() {
  const [studentsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, "students")),
    getDocs(collection(db, "users")),
  ]);
  const existingUsers = usersSnap.docs.map(item => ({ uid: item.id, email: String(item.data().email || "") }));
  const linkedStudentIds = new Set(usersSnap.docs.map(item => String(item.data().linkedStudentId || "")).filter(Boolean));
  let accountsCreated = 0, accountsSkippedNoEmail = 0, pinsSet = 0;
  for (const studentDoc of studentsSnap.docs) {
    const student = studentDoc.data() as { firstName?: string; lastName?: string; email?: string };
    const studentId = studentDoc.id;
    if (!linkedStudentIds.has(studentId)) {
      const email = String(student.email || "").trim();
      if (!email) {
        accountsSkippedNoEmail += 1;
      } else {
        await inviteUser({
          name: `${student.firstName || ""} ${student.lastName || ""}`.trim() || email,
          email, role: "Étudiant", linkedStudentId: studentId, existingUsers,
        });
        accountsCreated += 1;
      }
    }
    const salt = randomPinSalt();
    const hash = await hashPin("0000", salt);
    await setDoc(doc(db, "studentPins", studentId), {
      hash, salt, failedAttempts: 0, lockedUntil: new Date().toISOString(), updatedAt: serverTimestamp(),
    });
    pinsSet += 1;
  }
  return { totalStudents: studentsSnap.docs.length, accountsCreated, accountsSkippedNoEmail, pinsSet };
}
