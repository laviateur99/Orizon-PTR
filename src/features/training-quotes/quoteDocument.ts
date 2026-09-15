import type{TrainingQuote}from"./types";

const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));
const money=(value:unknown)=>(typeof value==="number"&&Number.isFinite(value)?value:0).toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const paragraphs=(value:string)=>escapeHtml(value).split(/\n{2,}/).map(text=>`<p>${text.replaceAll("\n","<br>")}</p>`).join("");

export function quoteDocumentHtml(quote:TrainingQuote,note=quote.customPdfNote||""){
 const rows=quote.lines.filter(line=>line.enabled).map(line=>`<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity}</td><td>${escapeHtml(line.unit)}</td><td>${money(line.unitPrice)}</td><td>${money(line.subtotal)}</td></tr>`).join("");
 return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(quote.quoteNumber)}</title><style>@page{size:letter;margin:17mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#12233b;margin:0}.top{display:flex;justify-content:space-between;border-bottom:4px solid #0876b9;padding-bottom:16px}.brand{display:flex;align-items:center;gap:14px}.brand img{width:170px;max-height:72px;object-fit:contain}.quote{text-align:right}.quote h1{margin:0;color:#08689f}.meta,.client{margin:20px 0;display:grid;grid-template-columns:1fr 1fr;gap:20px}.box{padding:14px;background:#f3f8fc;border-radius:10px}.box strong{display:block;margin-bottom:5px;color:#08689f}table{width:100%;border-collapse:collapse;margin:18px 0}th{background:#0a6596;color:white;text-align:left}th,td{padding:9px;border:1px solid #d5e1eb}td:nth-last-child(-n+2),th:nth-last-child(-n+2){text-align:right}.totals{margin-left:auto;width:340px}.totals div{display:flex;justify-content:space-between;padding:6px 0}.totals .grand{font-size:17px;font-weight:bold;border-top:2px solid #0876b9;margin-top:5px;padding-top:10px}.note{margin-top:24px;padding:16px;border-left:4px solid #0876b9;background:#f3f8fc}.footer{margin-top:30px;border-top:1px solid #ccd9e4;padding-top:12px;color:#52677e;font-size:11px}.no-print{position:fixed;right:18px;top:18px;padding:10px 16px;background:#0876b9;color:white;border:0;border-radius:8px;font-weight:bold}@media print{.no-print{display:none!important}}</style></head><body><button class="no-print" onclick="window.print()">Imprimer / enregistrer en PDF</button><header class="top"><div class="brand"><img src="${location.origin}/branding/orizon-aviation-logo.png" alt="Orizon Aviation"><strong>Orizon Aviation</strong></div><div class="quote"><h1>DEVIS DE FORMATION</h1><div>${escapeHtml(quote.quoteNumber)}</div></div></header><section class="meta"><div class="box"><strong>Date</strong>${escapeHtml(quote.date)}<br><strong>Expiration</strong>${escapeHtml(quote.expirationDate)}</div><div class="box"><strong>Formation</strong>${escapeHtml(quote.trainingType)}</div></section><section class="client box"><div><strong>Client</strong>${escapeHtml(quote.customerName)}</div><div><strong>Coordonnées</strong>${escapeHtml(quote.customerEmail)}<br>${escapeHtml(quote.customerPhone)}</div></section><table><thead><tr><th>Description</th><th>Qté</th><th>Unité</th><th>Prix unitaire</th><th>Sous-total</th></tr></thead><tbody>${rows}</tbody></table><section class="totals"><div><span>Total Orizon</span><strong>${money(quote.orizonSubtotal)}</strong></div><div><span>Frais externes estimés</span><strong>${money(quote.externalFees)}</strong></div><div><span>TPS (${quote.gstRate} %)</span><strong>${money(quote.gst)}</strong></div><div><span>TVQ (${quote.qstRate} %)</span><strong>${money(quote.qst)}</strong></div><div class="grand"><span>Total estimatif</span><strong>${money(quote.total)}</strong></div></section>${quote.notes?`<section class="note"><h2>Notes du devis</h2>${paragraphs(quote.notes)}</section>`:""}${note?`<section class="note"><h2>Informations supplémentaires</h2>${paragraphs(note)}</section>`:""}<footer class="footer">Ce devis présente une estimation fondée sur le programme prévu. Le coût final peut varier selon la progression, les heures réellement nécessaires et les frais externes applicables.</footer></body></html>`;
}

export function openQuotePdfPreview(quote:TrainingQuote,note?:string){
 let html:string;
 try{html=quoteDocumentHtml(quote,note)}catch(error){throw new Error(`Le devis n’a pas pu être généré (${error instanceof Error?error.message:"erreur inconnue"}).`)}
 const preview=window.open("","_blank");
 if(!preview)throw new Error("Le navigateur a bloqué l’aperçu. Autorisez les fenêtres contextuelles pour Flight Director, puis réessayez.");
 try{
  const blobUrl=URL.createObjectURL(new Blob([html],{type:"text/html"}));
  preview.addEventListener("load",()=>URL.revokeObjectURL(blobUrl),{once:true});
  preview.location.href=blobUrl;
 }catch(error){
  preview.close();
  throw new Error(`L’aperçu du devis n’a pas pu s’afficher (${error instanceof Error?error.message:"erreur inconnue"}).`)
 }
}
