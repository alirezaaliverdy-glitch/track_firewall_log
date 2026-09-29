import { apiRequest } from "./apiTransport";
export type GeoStatus={ready:boolean;loadedAt:string|null;source:string;license:string;updateMode:string};
async function request<T>(path:string,init?:RequestInit):Promise<T>{const response=await apiRequest(path,init);if(!response.ok)throw new Error("GEOIP_REQUEST_FAILED");return response.json() as Promise<T>;}
export const getAttackerGeoStatus=()=>request<GeoStatus>("/security/attackers-geoip/status");
export const refreshAttackerGeo=()=>request<GeoStatus>("/security/attackers-geoip/refresh",{method:"POST"});
export type RetentionStatus={totalEvents:number;maxRows:number;policy:{lowDays:number;mediumDays:number;highDays:number;criticalDays:number;runIntervalMinutes:number}};
export const getEventRetentionStatus=()=>request<RetentionStatus>("/events/retention/status");
