export type InstructorClass = "Classe 1" | "Classe 2" | "Classe 3" | "Classe 4";
export type InstructorStatus = "Actif" | "Inactif" | "Congé";
export type InstructorClassChange={from:InstructorClass;to:InstructorClass;effectiveDate:string;recordedAt:string};

export type Instructor = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  classLevel: InstructorClass;
  classHistory: InstructorClassChange[];
  status: InstructorStatus;
  employeeNumber: string;
  licenseNumber: string;
  hiredDate: string;
  birthDate: string;
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
