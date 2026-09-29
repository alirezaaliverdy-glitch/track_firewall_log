import { isIP, BlockList } from "node:net";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import maxmind, { type CountryResponse, type AsnResponse } from "maxmind";

const blocked=new BlockList();
for(const [network,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(network,prefix,"ipv4");
for(const [network,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32]] as const) blocked.addSubnet(network,prefix,"ipv6");
export function publicGeoIp(ip:string){const family=isIP(ip);return family!==0 && !blocked.check(ip,family===4?"ipv4":"ipv6") && !ip.toLowerCase().startsWith("::ffff:");}

const directory=join(process.env.TELEMETRY_STORE_DIR??"/app/storage/telemetry","geoip");
let readers: {country:Awaited<ReturnType<typeof maxmind.open<CountryResponse>>>;asn:Awaited<ReturnType<typeof maxmind.open<AsnResponse>>>;loadedAt:string}|null=null;
let loading:Promise<boolean>|null=null;
let nextLoadAt=0;
async function load(){
  if(readers)return true;
  if(Date.now()<nextLoadAt)return false;
  if(!loading) loading=(async()=>{try{const [country,asn]=await Promise.all([maxmind.open<CountryResponse>(join(directory,"country.mmdb")),maxmind.open<AsnResponse>(join(directory,"asn.mmdb"))]);readers={country,asn,loadedAt:new Date().toISOString()};return true;}catch{nextLoadAt=Date.now()+60_000;return false;}})().finally(()=>{loading=null;});
  return loading;
}
export async function lookupAttackerGeo(ip:string){
  if(!publicGeoIp(ip))return {status:"not_public" as const,geo:null,asn:null,networkOwner:null};
  if(!await load())return {status:"database_unavailable" as const,geo:null,asn:null,networkOwner:null};
  const location=readers!.country.get(ip);const network=readers!.asn.get(ip);
  const geo=location?.country?.iso_code?{countryCode:location.country.iso_code,countryName:location.country.names?.en??location.country.iso_code}:null;
  const asn=network?.autonomous_system_number??null;
  return {status:geo||asn?"dbip_lite" as const:"not_found" as const,geo,asn,networkOwner:network?.autonomous_system_organization??null};
}
export function geoDatabaseStatus(){return {ready:!!readers,loadedAt:readers?.loadedAt??null,source:"DB-IP Lite",license:"CC BY 4.0",updateMode:"explicit_admin_refresh"};}
export async function getAttackerGeoStatus(){await load();return geoDatabaseStatus();}

async function download(kind:"country"|"asn",period:string){
  const url=`https://download.db-ip.com/free/dbip-${kind}-lite-${period}.mmdb.gz`;
  const response=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(60_000)});
  if(!response.ok||!response.body)throw new Error("GEOIP_DOWNLOAD_FAILED");
  const chunks:Uint8Array[]=[];let bytes=0;
  for await(const chunk of response.body){const data=chunk as Uint8Array;bytes+=data.byteLength;if(bytes>30*1024*1024)throw new Error("GEOIP_DOWNLOAD_TOO_LARGE");chunks.push(data);}
  const data=gunzipSync(Buffer.concat(chunks),{maxOutputLength:90*1024*1024});
  if(data.length<100_000)throw new Error("GEOIP_DATABASE_TOO_SMALL");
  return data;
}
export async function refreshAttackerGeoDatabase(){
  const period=new Date().toISOString().slice(0,7);
  const [country,asn]=await Promise.all([download("country",period),download("asn",period)]);
  await mkdir(directory,{recursive:true});
  const pending=[join(directory,"country.next.mmdb"),join(directory,"asn.next.mmdb")];
  try{
    await Promise.all([writeFile(pending[0],country,{mode:0o600}),writeFile(pending[1],asn,{mode:0o600})]);
    await Promise.all([maxmind.open<CountryResponse>(pending[0]),maxmind.open<AsnResponse>(pending[1])]);
    await rename(pending[0],join(directory,"country.mmdb"));
    await rename(pending[1],join(directory,"asn.mmdb"));
    readers=null;
    nextLoadAt=0;
    if(!await load())throw new Error("GEOIP_DATABASE_INVALID");
    return geoDatabaseStatus();
  }finally{await Promise.all(pending.map(path=>rm(path,{force:true}).catch(()=>undefined)));}
}
