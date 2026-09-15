"use client";
import{useEffect,useState}from"react";
import{useAuth}from"@/features/auth/AuthProvider";
import{subscribeTrainingQuote}from"./firestore";
import type{TrainingQuote}from"./types";

const money=(value:unknown)=>(typeof value==="number"&&Number.isFinite(value)?value:0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const paragraphs=(value:string)=>value.split(/\n{2,}/).map((block,i)=><p key={i}>{block.split("\n").map((line,j,arr)=><span key={j}>{line}{j<arr.length-1&&<br/>}</span>)}</p>);

export function TrainingQuotePrintPage({quoteId}:{quoteId:string}){
 const{profile}=useAuth();
 const[quote,setQuote]=useState<TrainingQuote|null|undefined>(undefined);
 const[error,setError]=useState("");
 useEffect(()=>{
  document.body.classList.add("training-quote-print-mode");
  return()=>document.body.classList.remove("training-quote-print-mode");
 },[]);
 useEffect(()=>{
  if(profile?.role!=="Administrateur")return;
  return subscribeTrainingQuote(quoteId,setQuote,e=>setError(e.message));
 },[quoteId,profile?.role]);
 if(profile?.role!=="Administrateur")return <main className="quote-print-status">Accès non autorisé à ce devis.</main>;
 if(error)return <main className="quote-print-status">{error}</main>;
 if(quote===undefined)return <main className="quote-print-status">Chargement du devis…</main>;
 if(quote===null)return <main className="quote-print-status">Ce devis est introuvable.</main>;
 const rows=quote.lines.filter(line=>line.enabled);
 return <main className="quote-print-page">
  <style>{`
   @page{size:letter;margin:15mm}
   .quote-print-sheet{max-width:190mm;margin:0 auto;padding:14mm;background:#fff;color:#12233b;font:13px Arial,sans-serif}
   .quote-print-top{display:flex;justify-content:space-between;border-bottom:4px solid #0876b9;padding-bottom:16px}
   .quote-print-brand{display:flex;align-items:center;gap:14px}
   .quote-print-brand img{width:170px;max-height:72px;object-fit:contain}
   .quote-print-heading{text-align:right}
   .quote-print-heading h1{margin:0;color:#08689f;font-size:20px}
   .quote-print-meta,.quote-print-client{margin:20px 0;display:grid;grid-template-columns:1fr 1fr;gap:20px}
   .quote-print-box{padding:14px;background:#f3f8fc;border-radius:10px}
   .quote-print-box strong{display:block;margin-bottom:5px;color:#08689f}
   .quote-print-table{width:100%;border-collapse:collapse;margin:18px 0}
   .quote-print-table th{background:#0a6596;color:#fff;text-align:left}
   .quote-print-table th,.quote-print-table td{padding:9px;border:1px solid #d5e1eb}
   .quote-print-table td:nth-last-child(-n+2),.quote-print-table th:nth-last-child(-n+2){text-align:right}
   .quote-print-table tr{break-inside:avoid;page-break-inside:avoid}
   .quote-print-totals{margin-left:auto;width:340px}
   .quote-print-totals div{display:flex;justify-content:space-between;padding:6px 0}
   .quote-print-totals .grand{font-size:17px;font-weight:bold;border-top:2px solid #0876b9;margin-top:5px;padding-top:10px}
   .quote-print-note{margin-top:24px;padding:16px;border-left:4px solid #0876b9;background:#f3f8fc;break-inside:avoid}
   .quote-print-footer{margin-top:30px;border-top:1px solid #ccd9e4;padding-top:12px;color:#52677e;font-size:11px}
   .quote-print-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:190mm;margin:0 auto 16px}
   @media print{
    .no-print{display:none!important}
    body.training-quote-print-mode *{visibility:hidden!important}
    body.training-quote-print-mode .quote-print-sheet,body.training-quote-print-mode .quote-print-sheet *{visibility:visible!important}
    body.training-quote-print-mode .quote-print-sheet{display:block!important;position:absolute;inset:0;width:100%;max-width:none;margin:0}
   }
  `}</style>
  <div className="quote-print-toolbar no-print">
   <a className="button secondary" href="/admin?tab=quotes">Retour aux devis</a>
   <button type="button" className="button" onClick={()=>window.print()}>Imprimer / enregistrer en PDF</button>
  </div>
  <section className="quote-print-sheet">
   <header className="quote-print-top">
    <div className="quote-print-brand"><img src="/branding/orizon-aviation-logo.png" alt="Orizon Aviation"/><strong>Orizon Aviation</strong></div>
    <div className="quote-print-heading"><h1>DEVIS DE FORMATION</h1><div>{quote.quoteNumber}</div></div>
   </header>
   <section className="quote-print-meta">
    <div className="quote-print-box"><strong>Date</strong>{quote.date}<br/><strong>Expiration</strong>{quote.expirationDate}</div>
    <div className="quote-print-box"><strong>Formation</strong>{quote.trainingType}</div>
   </section>
   <section className="quote-print-client">
    <div className="quote-print-box"><strong>Client</strong>{quote.customerName}</div>
    <div className="quote-print-box"><strong>Coordonnées</strong>{quote.customerEmail}{quote.customerPhone&&<><br/>{quote.customerPhone}</>}</div>
   </section>
   <table className="quote-print-table">
    <thead><tr><th>Description</th><th>Qté</th><th>Unité</th><th>Prix unitaire</th><th>Sous-total</th></tr></thead>
    <tbody>{rows.map(line=><tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unit}</td><td>{money(line.unitPrice)}</td><td>{money(line.subtotal)}</td></tr>)}</tbody>
   </table>
   <section className="quote-print-totals">
    <div><span>Total Orizon</span><strong>{money(quote.orizonSubtotal)}</strong></div>
    <div><span>Frais externes estimés</span><strong>{money(quote.externalFees)}</strong></div>
    <div><span>TPS ({quote.gstRate} %)</span><strong>{money(quote.gst)}</strong></div>
    <div><span>TVQ ({quote.qstRate} %)</span><strong>{money(quote.qst)}</strong></div>
    <div className="grand"><span>Total estimatif</span><strong>{money(quote.total)}</strong></div>
   </section>
   {quote.notes&&<section className="quote-print-note"><h2>Notes du devis</h2>{paragraphs(quote.notes)}</section>}
   {quote.customPdfNote&&<section className="quote-print-note"><h2>Informations supplémentaires</h2>{paragraphs(quote.customPdfNote)}</section>}
   <footer className="quote-print-footer">Ce devis présente une estimation fondée sur le programme prévu. Le coût final peut varier selon la progression, les heures réellement nécessaires et les frais externes applicables.</footer>
  </section>
 </main>;
}
