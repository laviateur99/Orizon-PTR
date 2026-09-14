"use client";
import { createContext,useContext,useEffect,useMemo,useState } from "react";
import { onAuthStateChanged,signOut,type User } from "firebase/auth";
import { collection,doc,getDoc,getDocs,limit,onSnapshot,query,serverTimestamp,setDoc,updateDoc,type Unsubscribe } from "firebase/firestore";
import { auth,db } from "@/services/firebase/client";
import { hasModuleAccess,rolePermissions,type AppModule,type UserProfile } from "./types";

type AuthValue={user:User|null;profile:UserProfile|null;loading:boolean;can:(module:AppModule)=>boolean;logout:()=>Promise<void>};
const Context=createContext<AuthValue|null>(null);
const asProfile=(uid:string,data:Record<string,unknown>):UserProfile=>{const role=(data.role as UserProfile["role"])||"Étudiant";return{uid,name:String(data.name||""),email:String(data.email||""),role,permissions:Array.isArray(data.permissions)?data.permissions as AppModule[]:rolePermissions[role],active:data.active!==false,mustSetPassword:data.mustSetPassword===true,linkedStudentId:String(data.linkedStudentId||""),linkedInstructorId:String(data.linkedInstructorId||""),createdAt:String(data.createdAt||""),lastLoginAt:String(data.lastLoginAt||"")}};

export function AuthProvider({children}:{children:React.ReactNode}){
 const[user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<UserProfile|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let offProfile:Unsubscribe|undefined;
 const offAuth=onAuthStateChanged(auth,async current=>{
   offProfile?.();offProfile=undefined;setLoading(true);setUser(current);setProfile(null);
   if(!current){setLoading(false);return;}
   const ref=doc(db,"users",current.uid);
   offProfile=onSnapshot(ref,value=>{
    setProfile(value.exists()?asProfile(current.uid,value.data()):null);
    setLoading(false);
   },()=>{setProfile(null);setLoading(false)});
   try{
    let snap=await getDoc(ref);
    if(!snap.exists()){
     const email=(current.email||"").trim().toLowerCase(),invitation=email?await getDoc(doc(db,"pendingInvitations",email)):null;
     if(invitation?.exists()){
      const data=invitation.data();
      await setDoc(ref,{name:data.name||email,email,role:data.role,permissions:data.permissions,active:true,mustSetPassword:true,linkedStudentId:data.linkedStudentId||"",linkedInstructorId:data.linkedInstructorId||"",invitedAt:data.invitedAt||"",acceptedAt:new Date().toISOString(),createdAtServer:serverTimestamp()});
      snap=await getDoc(ref);
     }else{
      const any=await getDocs(query(collection(db,"users"),limit(1)));
      if(any.empty){
       await setDoc(ref,{name:current.displayName||current.email?.split("@")[0]||"Administrateur",email:current.email||"",role:"Administrateur",permissions:rolePermissions.Administrateur,active:true,mustSetPassword:false,linkedStudentId:"",createdAt:new Date().toISOString(),createdAtServer:serverTimestamp()});
       snap=await getDoc(ref);
      }
     }
    }
    if(snap.exists()){
     setProfile(asProfile(current.uid,snap.data()));setLoading(false);
     void updateDoc(ref,{lastLoginAt:new Date().toISOString(),lastLoginAtServer:serverTimestamp()}).catch(()=>undefined);
    }
   }catch{
    setLoading(false);
   }
  });
  return()=>{offProfile?.();offAuth()};
 },[]);
 const value=useMemo<AuthValue>(()=>({user,profile,loading,can:module=>hasModuleAccess(profile,module),logout:()=>signOut(auth)}),[user,profile,loading]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAuth=()=>{const value=useContext(Context);if(!value)throw new Error("AuthProvider manquant");return value};
