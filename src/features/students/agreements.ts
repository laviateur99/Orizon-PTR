import {doc,onSnapshot,serverTimestamp,writeBatch,type FirestoreError,type Unsubscribe} from "firebase/firestore";
import {db} from "@/services/firebase/client";

export const RENTAL_AGREEMENT={
  id:"rental-agreement-2026",
  title:"Contrat de location des aéronefs et consentement relatif aux renseignements personnels",
  version:"2026.1",
  pdfPath:"/documents/contrat-location-version-2026.pdf",
  sha256:"8ea3fd4754b167ee02aa660db930e55641a0732eedf93ba98fe88afa03ade1ca"
} as const;

export type StudentAgreement={
  studentId:string;documentId:string;documentTitle:string;documentVersion:string;documentSha256:string;
  signerName:string;signerAddress:string;initials:string;accepted:boolean;privacyAccepted:boolean;
  studentSignature:string;privacySignature:string;under18:boolean;guardianName:string;guardianAddress:string;
  guardianCapacity:string;guardianSignature:string;signedAt:string;signedByUid:string;signedByEmail:string;
};

export function subscribeRentalAgreement(studentId:string,next:(value:StudentAgreement|null)=>void,error:(value:FirestoreError)=>void):Unsubscribe{
  return onSnapshot(doc(db,"studentAgreements",studentId),snapshot=>next(snapshot.exists()?snapshot.data() as StudentAgreement:null),error);
}

export async function signRentalAgreement(value:StudentAgreement){
  const batch=writeBatch(db),agreementRef=doc(db,"studentAgreements",value.studentId),studentRef=doc(db,"students",value.studentId);
  batch.set(agreementRef,{...value,createdAtServer:serverTimestamp()});
  batch.update(studentRef,{rentalAgreementSigned:true,rentalAgreementSignedAt:value.signedAt,rentalAgreementVersion:value.documentVersion,updatedAt:serverTimestamp()});
  await batch.commit();
}
