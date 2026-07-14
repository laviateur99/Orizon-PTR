export type InstructorClass = "Classe 1" | "Classe 2" | "Classe 3" | "Classe 4";
export type InstructorStatus = "Actif" | "Inactif" | "Congé";

export type Instructor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  classLevel: InstructorClass;
  status: InstructorStatus;
  employeeNumber: string;
  hiredDate: string;
  notes: string;
};

export type InstructorDocument = {
  id: string;
  instructorId: string;
  type: string;
  number: string;
  expiryDate: string;
  notes: string;
};
