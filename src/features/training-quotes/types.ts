export const trainingRateCategories = ["Avion","Instructeur","Simulateur","Formation théorique","Briefing","Examen","Frais d'inscription","Matériel","Autre"] as const;
export const trainingRateUnits = ["heure","forfait","unité"] as const;
export const trainingQuoteStatuses = ["Brouillon","Envoyé","Accepté","Refusé","Expiré"] as const;
export type TrainingRateCategory=typeof trainingRateCategories[number];
export type TrainingRateUnit=typeof trainingRateUnits[number];
export type TrainingQuoteStatus=typeof trainingQuoteStatuses[number];
export type TrainingQuoteLineType="avion"|"instructeur"|"simulateur"|"formation théorique"|"briefing / préparation au sol"|"examen"|"matériel"|"frais externes"|"forfait"|"autre";
export type TrainingQuoteLineQualifier="double commande"|"solo"|"PIC"|"instrument"|"multimoteur"|"nuit"|"voyage"|"autre";
export type TrainingRate={id:string;name:string;category:TrainingRateCategory;description:string;price:number;unit:TrainingRateUnit;taxable:boolean;active:boolean;effectiveDate:string;aircraftId?:string;aircraftType?:string;t2202Eligible:boolean;tp752Eligible:boolean;createdAt?:unknown;updatedAt?:unknown};
export type TrainingQuoteLine={id:string;rateId:string;description:string;quantity:number;minimumQuantity?:number;unit:TrainingRateUnit;unitPrice:number;subtotal:number;taxable:boolean;lineType:TrainingQuoteLineType;qualifier?:TrainingQuoteLineQualifier;aircraftType?:string;externalFee:boolean;optional:boolean;enabled:boolean};
export type TrainingTaxSettings={gstRate:number;qstRate:number;updatedAt?:unknown};
export type TrainingQuote={id:string;quoteNumber:string;date:string;expirationDate:string;customerType:"student"|"prospect";studentId?:string;customerName:string;customerPhone:string;customerEmail:string;trainingType:string;notes:string;status:TrainingQuoteStatus;lines:TrainingQuoteLine[];subtotal:number;orizonSubtotal:number;externalFees:number;gstRate:number;qstRate:number;gst:number;qst:number;taxes:number;total:number;templateId?:string;createdBy:string;createdAt?:unknown;updatedAt?:unknown};
// Structure réservée aux modèles futurs; aucune interface de gestion n'est activée pour le moment.
export type TrainingQuoteTemplateLine={id:string;lineType:TrainingQuoteLineType;description:string;minimumQuantity?:number;quotedQuantity:number;unit:TrainingRateUnit;aircraftType?:string;qualifier?:TrainingQuoteLineQualifier;externalFee:boolean;optional:boolean;rateCategory?:TrainingRateCategory;rateSearchTerms?:string[];fixedUnitPrice?:number;sourceNote?:string};
export type TrainingQuoteTemplate={id:string;name:string;trainingType:string;active:boolean;sourceDocument:string;description?:string;lines:TrainingQuoteTemplateLine[];createdAt?:unknown;updatedAt?:unknown};
