export type PayrollPeriodWindow={id:string;startDate:string;endDate:string};
const DAY=86_400_000;
const ANCHOR=Date.UTC(2026,6,19);
const iso=(value:number)=>new Date(value).toISOString().slice(0,10);
export function payrollPeriodForDate(date:string):PayrollPeriodWindow{const parsed=Date.parse(`${date}T00:00:00Z`);if(!Number.isFinite(parsed))throw new Error("Date de paie invalide.");const start=ANCHOR+Math.floor((parsed-ANCHOR)/(14*DAY))*14*DAY;return{id:`pay-${iso(start)}`,startDate:iso(start),endDate:iso(start+13*DAY)};}
