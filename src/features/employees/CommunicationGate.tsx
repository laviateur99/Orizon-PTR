"use client";
import {useEffect,useMemo,useState,type ReactNode} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAuth} from "@/features/auth/AuthProvider";
import {subscribeAcknowledgements,subscribeCommunications} from "./firestore";
import type {CommunicationAcknowledgement,EmployeeCommunication} from "./types";

export function CommunicationGate({children}:{children:ReactNode}){
 const pathname=usePathname(),{user,profile,can}=useAuth();
 const[communications,setCommunications]=useState<EmployeeCommunication[]>([]),[acks,setAcks]=useState<CommunicationAcknowledgement[]>([]),[ready,setReady]=useState(false);
 const eligible=can("employees");
 useEffect(()=>{if(!eligible){setReady(true);return}return subscribeCommunications(values=>{setCommunications(values);setReady(true)},()=>setReady(true))},[eligible]);
 useEffect(()=>{if(!eligible||!user)return;return subscribeAcknowledgements(user.uid,setAcks,()=>undefined)},[eligible,user]);
 const pending=useMemo(()=>{const read=new Set(acks.map(item=>item.communicationId));return communications.filter(item=>item.active&&item.required&&Boolean(profile&&item.audienceRoles.includes(profile.role))&&!read.has(item.id))},[communications,acks,profile]);
 const bypass=pathname.startsWith("/employees")||pathname.startsWith("/emergency");
 if(!ready)return <section className="card"><p>Vérification des communications obligatoires…</p></section>;
 if(pending.length&&!bypass)return <section className="card communication-block"><span className="badge warn">Lecture obligatoire</span><h1>{pending.length} communication(s) à lire</h1><p>Vous devez lire et confirmer ces communications internes avant de poursuivre vos activités dans Flight Director.</p><Link className="button" href="/employees">Lire les communications</Link></section>;
 return <>{children}</>;
}
