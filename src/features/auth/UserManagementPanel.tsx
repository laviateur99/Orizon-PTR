"use client";
import { useEffect,useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { collection,deleteDoc,doc,onSnapshot,serverTimestamp,setDoc,updateDoc } from "firebase/firestore";
import { auth,db } from "@/services/firebase/client";
import { subscribeStudents } from "@/features/students/firestore";
import type { Student } from "@/features/students/types";
import { subscribeInstructors } from "@/features/instructors/firestore";
import { deleteInstructor } from "@/features/instructors/firestore";
import type { Instructor } from "@/features/instructors/types";
import { inviteUser } from "./inviteUser";
import { moduleLabels,modules,rolePermissions,roles,type AppModule,type UserProfile,type UserRole } from "./types";

const profile=(id:string,data:Record<string,unknown>):UserProfile=>({uid:id,name:String(data.name||""),email:String(data.email||""),role:(data.role as UserRole)||"Étudiant",permissions:Array.isArray(data.permissions)?data.permissions as AppModule[]:[],active:data.active!==false,linkedStudentId:String(data.linkedStudentId||""),linkedInstructorId:String(data.linkedInstructorId||""),createdAt:String(data.createdAt||""),lastLoginAt:String(data.lastLoginAt||"")});

export function UserManagementPanel(){
 const[users,setUsers]=useState<UserProfile[]>([]),[students,setStudents]=useState<Student[]>([]),[instructors,setInstructors]=useState<Instructor[]>([]),[editing,setEditing]=useState<UserProfile|null>(null);
 const[form,setForm]=useState({name:"",email:"",role:"Instructeur" as UserRole}),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>onSnapshot(collection(db,"users"),snap=>setUsers(snap.docs.map(item=>profile(item.id,item.data())).sort((a,b)=>a.name.localeCompare(b.name)))),[]);
 useEffect(()=>subscribeStudents({next:setStudents,error:error=>setMessage(error.message)}),[]);
 useEffect(()=>subscribeInstructors({next:setInstructors,error:error=>setMessage(error.message)}),[]);

 async function invite(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  const email=form.email.trim().toLowerCase(),matchedInstructor=instructors.find(item=>item.email.trim().toLowerCase()===email);
  let linkedInstructorId=matchedInstructor?.id||"";
  try{
   if(form.role==="Instructeur"&&!linkedInstructorId){
    linkedInstructorId=`instructor-${crypto.randomUUID()}`;
    const parts=form.name.trim().split(/\s+/);
    await setDoc(doc(db,"instructors",linkedInstructorId),{firstName:parts[0]||"Instructeur",lastName:parts.slice(1).join(" "),name:form.name.trim(),email,phone:"",classLevel:"Classe 4",status:"Actif",active:true,employeeNumber:"",hiredDate:"",notes:"",createdAt:serverTimestamp()});
   }
   await inviteUser({name:form.name,email,role:form.role,linkedInstructorId,existingUsers:users});
   setMessage(`Invitation d’activation envoyée à ${email}.${form.role==="Instructeur"?" Fiche instructeur associée automatiquement.":""}`);setForm({name:"",email:"",role:"Instructeur"});
  }catch(error){setMessage(error instanceof Error?error.message:"Invitation impossible.");}finally{setBusy(false)}
 }
 async function save(){if(!editing)return;const matchedInstructor=instructors.find(item=>item.email.trim().toLowerCase()===editing.email.trim().toLowerCase());const linkedInstructorId=editing.role==="Instructeur"?(editing.linkedInstructorId||matchedInstructor?.id||""):"";await updateDoc(doc(db,"users",editing.uid),{name:editing.name,role:editing.role,permissions:editing.permissions,active:editing.active,linkedStudentId:editing.role==="Étudiant"?(editing.linkedStudentId||""):"",linkedInstructorId,updatedAt:new Date().toISOString(),updatedAtServer:serverTimestamp()});setEditing(null);setMessage(editing.role==="Instructeur"&&linkedInstructorId?"Accès mis à jour et fiche instructeur associée.":"Accès utilisateur mis à jour.")}
 async function removeAccess(){if(!editing||editing.uid===auth.currentUser?.uid)return;const removesInstructor=editing.role==="Instructeur"&&Boolean(editing.linkedInstructorId);const detail=removesInstructor?"Son compte utilisateur ET sa fiche instructeur seront supprimés.":"Sa fiche de rôle et ses invitations seront supprimées. Cette action ne supprime pas ses autres dossiers de formation.";if(!window.confirm(`Supprimer définitivement l’accès de ${editing.name||editing.email}?\n\n${detail}`))return;setBusy(true);try{await deleteDoc(doc(db,"pendingInvitations",editing.email.toLowerCase())).catch(()=>undefined);if(removesInstructor)await deleteInstructor(editing.linkedInstructorId!);await deleteDoc(doc(db,"users",editing.uid));setEditing(null);setMessage(removesInstructor?`Le compte ${editing.email} et sa fiche instructeur ont été supprimés.`:`L’accès de ${editing.email} a été supprimé.`);}catch(error){setMessage(error instanceof Error?error.message:"Suppression impossible.");}finally{setBusy(false)}}
 const changeRole=(role:UserRole)=>setEditing(current=>current?{...current,role,permissions:rolePermissions[role],linkedStudentId:role==="Étudiant"?current.linkedStudentId:"",linkedInstructorId:role==="Instructeur"?current.linkedInstructorId:""}:current);
 const toggle=(module:AppModule)=>setEditing(current=>current?{...current,permissions:current.permissions.includes(module)?current.permissions.filter(item=>item!==module):[...current.permissions,module]}:current);
 const sortedStudents=students.slice().sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
 const sortedInstructors=instructors.slice().sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

 return <section className="card user-management">
  <header><div><span className="badge ok">Sécurité</span><h2>Utilisateurs et rôles</h2><p>Inviter les utilisateurs et contrôler les sections auxquelles ils ont accès.</p></div></header>
  {message&&<div className={`notice ${message.includes("impossible")||message.includes("Firebase")?"error":""}`}>{message}</div>}
  <form className="invite-form" onSubmit={invite}><label>Nom complet<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Adresse courriel<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Rôle<select value={form.role} onChange={e=>setForm({...form,role:e.target.value as UserRole})}>{roles.map(role=><option key={role}>{role}</option>)}</select></label><button className="button" disabled={busy}>{busy?"Envoi…":"Envoyer l’invitation"}</button></form>
  <div className="user-list"><div className="user-list-head"><span>Utilisateur</span><span>Rôle</span><span>État</span><span>Dernière connexion</span><span/></div>{users.map(item=><div className="user-list-row" key={item.uid}><div><strong>{item.name||"Nom non défini"}</strong><small>{item.email}</small></div><span>{item.role}</span><span className={`badge ${item.active?"ok":"danger"}`}>{item.active?"Actif":"Suspendu"}</span><span>{item.lastLoginAt?new Date(item.lastLoginAt).toLocaleString("fr-CA"):"Jamais"}</span><button className="button secondary" onClick={()=>setEditing(item)}>Gérer</button></div>)}</div>
  {editing&&<div className="modal-backdrop"><section className="modal"><header><div><h2>Accès de {editing.name}</h2><p>{editing.email}</p></div><button className="icon-button" onClick={()=>setEditing(null)}>×</button></header><div className="modal-body">
   <label>Nom<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
   <label>Rôle<select value={editing.role} onChange={e=>changeRole(e.target.value as UserRole)}>{roles.map(role=><option key={role}>{role}</option>)}</select></label>
   {editing.role==="Étudiant"&&<label>Dossier étudiant lié<select value={editing.linkedStudentId||""} onChange={e=>setEditing({...editing,linkedStudentId:e.target.value})}><option value="">Aucun dossier — PTR bloqué</option>{sortedStudents.map(student=><option key={student.id} value={student.id}>{student.firstName} {student.lastName} · {student.email||student.id}</option>)}</select><small>Ce compte pourra uniquement consulter le PTR sélectionné.</small></label>}
   {editing.role==="Instructeur"&&<label>Fiche instructeur liée<select value={editing.linkedInstructorId||""} onChange={e=>setEditing({...editing,linkedInstructorId:e.target.value})}><option value="">Aucune fiche — dossier instructeur bloqué</option>{sortedInstructors.map(instructor=><option key={instructor.id} value={instructor.id}>{instructor.firstName} {instructor.lastName} · {instructor.email||instructor.id}</option>)}</select><small>Ce compte verra uniquement cette fiche et ses propres temps de service.</small></label>}
   <label className="active-check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Compte actif</label><h3>Accès aux modules</h3><div className="permission-grid">{modules.map(module=><label key={module}><input type="checkbox" checked={editing.permissions.includes(module)} onChange={()=>toggle(module)}/>{moduleLabels[module]}</label>)}</div>{editing.uid===auth.currentUser?.uid&&<div className="notice">Votre propre compte administrateur ne peut pas être supprimé.</div>}
  </div><footer><button className="button danger" onClick={removeAccess} disabled={busy||editing.uid===auth.currentUser?.uid}>Supprimer l’utilisateur</button><span/><button className="button secondary" onClick={()=>sendPasswordResetEmail(auth,editing.email).then(()=>setMessage("Courriel de réinitialisation envoyé."))}>Réinitialiser le mot de passe</button><button className="button" onClick={save}>Enregistrer</button></footer></section></div>}
 </section>;
}
