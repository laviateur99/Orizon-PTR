import { NextRequest, NextResponse } from "next/server";

const FALLBACK_STATION = "CYQB";

type AviationWeatherMetar = {
  rawOb?:string;
  raw_text?:string;
  obsTime?:number|string;
  reportTime?:number|string;
  temp?:number;
  dewp?:number;
  wdir?:number|string;
  wspd?:number;
  wgst?:number;
  visib?:number|string;
  altim?:number;
  wxString?:string;
  clouds?:Array<{cover?:string;base?:number}>;
};

type AviationWeatherTaf = {
  rawTAF?:string;
  raw_text?:string;
  issueTime?:number|string;
  validTimeFrom?:number|string;
  validTimeTo?:number|string;
};

function safeStation(value:string|null){
  const station=(value||FALLBACK_STATION).trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(station)?station:FALLBACK_STATION;
}

function observationTime(value:number|string|undefined){
  if(typeof value==="number")return new Date(value*1000).toISOString();
  if(typeof value==="string"){
    const numeric=Number(value);
    if(Number.isFinite(numeric))return new Date(numeric*1000).toISOString();
    const parsed=new Date(value);
    if(!Number.isNaN(parsed.getTime()))return parsed.toISOString();
  }
  return "";
}

function flightCategory(metar:AviationWeatherMetar){
  const visibility=Number(metar.visib);
  const ceiling=(metar.clouds||[])
    .filter(layer=>["BKN","OVC","VV"].includes(layer.cover||"")&&typeof layer.base==="number")
    .map(layer=>layer.base as number)
    .sort((a,b)=>a-b)[0];
  if((Number.isFinite(visibility)&&visibility<1)||(ceiling!==undefined&&ceiling<500))return"LIFR";
  if((Number.isFinite(visibility)&&visibility<3)||(ceiling!==undefined&&ceiling<1000))return"IFR";
  if((Number.isFinite(visibility)&&visibility<=5)||(ceiling!==undefined&&ceiling<=3000))return"MVFR";
  return"VFR";
}

export async function GET(request:NextRequest){
  const station=safeStation(request.nextUrl.searchParams.get("station"));
  try{
    const options={
      headers:{"User-Agent":"Orizon-Flight-Director/19.3.2"},
      next:{revalidate:60}
    };
    const [metarResponse,tafResponse]=await Promise.all([
      fetch(`https://aviationweather.gov/api/data/metar?ids=${station}&format=json`,options),
      fetch(`https://aviationweather.gov/api/data/taf?ids=${station}&format=json`,options)
    ]);
    if(!metarResponse.ok)throw new Error(`Weather service ${metarResponse.status}`);
    const reports=await metarResponse.json() as AviationWeatherMetar[];
    const forecasts:AviationWeatherTaf[]=tafResponse.ok&&tafResponse.status!==204
      ?await tafResponse.json() as AviationWeatherTaf[]
      :[];
    const report=reports[0];
    const forecast=forecasts[0];
    if(!report)return NextResponse.json({error:"Aucune observation disponible"},{status:404});
    return NextResponse.json({
      station,
      raw:report.rawOb||report.raw_text||"",
      observedAt:observationTime(report.obsTime||report.reportTime),
      category:flightCategory(report),
      temperatureC:report.temp,
      dewpointC:report.dewp,
      windDirection:report.wdir,
      windSpeedKt:report.wspd,
      windGustKt:report.wgst,
      visibilitySm:report.visib,
      altimeterHpa:report.altim,
      weather:report.wxString||"",
      clouds:report.clouds||[],
      taf:forecast?.rawTAF||forecast?.raw_text||"",
      tafIssuedAt:observationTime(forecast?.issueTime),
      tafValidFrom:observationTime(forecast?.validTimeFrom),
      tafValidTo:observationTime(forecast?.validTimeTo)
    });
  }catch{
    return NextResponse.json({error:"Le METAR est temporairement indisponible."},{status:502});
  }
}
