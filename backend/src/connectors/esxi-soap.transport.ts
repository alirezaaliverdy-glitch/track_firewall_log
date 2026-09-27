import https from "node:https";
import net from "node:net";
import { X509Certificate } from "node:crypto";
import { SaxesParser } from "saxes";
import type { Device } from "@prisma/client";
import { resolveCredentialById, resolveCredentialByName } from "../services/credential.service.js";

const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_XML_NODES = 40_000;
const TIMEOUT_MS = 15_000;
const SOAP_ACTION = '"urn:vim25/6.5"';
export type XmlNode = { name: string; attributes: Record<string, string>; children: XmlNode[]; text: string };
export class EsxiSoapError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "EsxiSoapError"; }
}
export const xmlEscape = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
export const children = (node: XmlNode | undefined, name: string) => node?.children.filter(item=>item.name===name) ?? [];
export const child = (node: XmlNode | undefined, name: string) => children(node,name)[0];
export const value = (node: XmlNode | undefined) => node?.text.trim() ?? "";
export const field = (node: XmlNode | undefined, name: string) => value(child(node,name));

export function parseSoap(xml: string): XmlNode {
  if (Buffer.byteLength(xml)>MAX_XML_BYTES) throw new EsxiSoapError("ESXI_RESPONSE_TOO_LARGE","ESXi response exceeds the safe size limit.");
  const parser = new SaxesParser({xmlns:true});
  const root: XmlNode = {name:"root",attributes:{},children:[],text:""};
  const stack=[root]; let count=0;
  parser.on("doctype",()=>{throw new EsxiSoapError("ESXI_XML_DTD_FORBIDDEN","ESXi XML DTD is forbidden.");});
  parser.on("opentag",(tag)=>{
    if (++count>MAX_XML_NODES) throw new EsxiSoapError("ESXI_XML_TOO_COMPLEX","ESXi XML exceeds the safe node limit.");
    const attrs: Record<string,string>={};
    for (const [key,attr] of Object.entries(tag.attributes)) attrs[typeof attr === "string" ? key : (attr.local||key)]=typeof attr === "string" ? attr : attr.value;
    const node:XmlNode={name:tag.local,attributes:attrs,children:[],text:""};
    stack[stack.length-1].children.push(node); stack.push(node);
  });
  parser.on("text",(text)=>{stack[stack.length-1].text+=text;});
  parser.on("cdata",(text)=>{stack[stack.length-1].text+=text;});
  parser.on("closetag",()=>{stack.pop();});
  try { parser.write(xml).close(); }
  catch(error) { if(error instanceof EsxiSoapError) throw error; throw new EsxiSoapError("ESXI_XML_INVALID","ESXi returned invalid XML."); }
  const envelope=child(root,"Envelope"),body=child(envelope,"Body");
  if(!body) throw new EsxiSoapError("ESXI_SOAP_INVALID","ESXi returned no SOAP body.");
  const fault=child(body,"Fault");
  if(fault) throw new EsxiSoapError("ESXI_SOAP_FAULT",/NoPermission/i.test(xml)?"ESXi account lacks the required privilege.":"ESXi rejected the API request.");
  return body;
}

function hostName(input: string) {
  const host=input.trim();
  if(host.length>253 || !host || /[\\/@?\s]/.test(host) || host.toLowerCase()==="localhost") throw new EsxiSoapError("ESXI_HOST_INVALID","Use an ESXi management IP or DNS name without a URL path.");
  const ip=net.isIP(host);
  if(ip===4) {
    const octets=host.split(".").map(Number);
    if(octets[0]===0 || octets[0]===127 || octets[0]>=224 || (octets[0]===169 && octets[1]===254)) throw new EsxiSoapError("ESXI_HOST_INVALID","This management address is not allowed.");
  } else if(ip===6) {
    if(host==="::1" || host.toLowerCase().startsWith("fe80:")) throw new EsxiSoapError("ESXI_HOST_INVALID","This management address is not allowed.");
  } else if(!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.includes("..")) throw new EsxiSoapError("ESXI_HOST_INVALID","Use a valid ESXi management DNS name.");
  return host;
}

export function esxiCertificate(device: Device) {
  const settings=device.capabilities && typeof device.capabilities==="object" && !Array.isArray(device.capabilities) ? device.capabilities as Record<string,unknown> : {};
  const ca=settings.esxiCaCertificate;
  if(ca===undefined || ca===null || ca==="") return undefined;
  if(typeof ca!=="string" || ca.length>16_384 || !/^\s*-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(ca)) throw new EsxiSoapError("ESXI_CA_INVALID","Provide exactly one PEM certificate; private keys are forbidden.");
  try { new X509Certificate(ca); } catch { throw new EsxiSoapError("ESXI_CA_INVALID","The ESXi CA certificate is invalid."); }
  return ca;
}

export class EsxiSoapClient {
  readonly agent: https.Agent;
  readonly host: string;
  private content?: XmlNode;
  private cookie="";
  private constructor(readonly device: Device, readonly username: string, readonly password: string) {
    this.host=hostName(device.host);
    this.agent=new https.Agent({keepAlive:true,maxSockets:2,maxFreeSockets:1,minVersion:"TLSv1.2",rejectUnauthorized:true,ca:esxiCertificate(device)});
  }
  static async connect(device: Device) {
    const saved=device.credentialId ? await resolveCredentialById(device.credentialId) : device.credentialRef ? await resolveCredentialByName(device.credentialRef) : null;
    if(!saved?.username || !saved.password) throw new EsxiSoapError("ESXI_CREDENTIAL_MISSING","A stored username/password credential is required.");
    const client=new EsxiSoapClient(device,saved.username,saved.password);
    try {
      const content=await client.call("RetrieveServiceContent",'<_this type="ServiceInstance">ServiceInstance</_this>',false);
      const info=child(content,"returnval");
      if(field(child(info,"about"),"apiType")!=="HostAgent") throw new EsxiSoapError("ESXI_NOT_STANDALONE","This endpoint is not a standalone ESXi host.");
      client.content=info;
      const manager=field(info,"sessionManager");
      if(!manager) throw new EsxiSoapError("ESXI_SERVICE_INVALID","ESXi did not expose a session manager.");
      await client.call("Login",`<_this type="SessionManager">${xmlEscape(manager)}</_this><userName>${xmlEscape(saved.username)}</userName><password>${xmlEscape(saved.password)}</password>`,false);
      if(!client.cookie) throw new EsxiSoapError("ESXI_SESSION_MISSING","ESXi did not create an authenticated session.");
      return {client,content:info!};
    } catch(error) {client.close();throw error;}
  }
  close() {this.agent.destroy();this.cookie="";}
  private async post(xml: string): Promise<string> {
    return await new Promise<string>((resolve,reject)=>{
      const request=https.request({
        hostname:this.host,port:this.device.managementPort,path:"/sdk",method:"POST",agent:this.agent,
        timeout:TIMEOUT_MS,rejectUnauthorized:true,
        headers:{"Content-Type":"text/xml; charset=utf-8","Content-Length":Buffer.byteLength(xml),SOAPAction:SOAP_ACTION,...(this.cookie?{Cookie:this.cookie}:{})}
      },response=>{
        const setCookie=response.headers["set-cookie"]?.find(item=>item.startsWith("vmware_soap_session="));
        if(setCookie) this.cookie=setCookie.split(";")[0];
        const chunks:Buffer[]=[];let size=0;
        response.on("data",(chunk:Buffer)=>{
          size+=chunk.length;
          if(size>MAX_XML_BYTES) request.destroy(new EsxiSoapError("ESXI_RESPONSE_TOO_LARGE","ESXi response exceeds the safe size limit."));
          else chunks.push(chunk);
        });
        response.on("end",()=>{
          if(!response.statusCode || response.statusCode<200 || response.statusCode>=300) return reject(new EsxiSoapError(response.statusCode===401?"ESXI_AUTH_FAILED":"ESXI_HTTP_ERROR",response.statusCode===401?"ESXi rejected the stored credentials.":`ESXi API returned HTTP ${response.statusCode??"unknown"}.`));
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      });
      request.once("timeout",()=>request.destroy(new EsxiSoapError("ESXI_TIMEOUT","ESXi API request timed out.")));
      request.once("error",error=>reject(error instanceof EsxiSoapError?error:new EsxiSoapError("ESXI_TLS_OR_NETWORK","Could not establish a verified TLS connection to ESXi. Check DNS, port and CA certificate.")));
      request.end(xml);
    });
  }
  async call(method: string, parameters: string, authenticated=true): Promise<XmlNode> {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(method)) throw new EsxiSoapError("ESXI_METHOD_INVALID","SOAP method is invalid.");
    if(authenticated && !this.cookie) throw new EsxiSoapError("ESXI_SESSION_MISSING","ESXi session is missing.");
    const envelope=`<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vim25="urn:vim25"><soapenv:Body><vim25:${method} xmlns="urn:vim25">${parameters}</vim25:${method}></soapenv:Body></soapenv:Envelope>`;
    const body=parseSoap(await this.post(envelope));
    const response=child(body,`${method}Response`);
    if(!response) throw new EsxiSoapError("ESXI_SOAP_INVALID","ESXi returned an unexpected SOAP response.");
    return response;
  }
  async properties(type: "Folder"|"Datacenter"|"ComputeResource"|"HostSystem"|"VirtualMachine"|"Datastore"|"Network"|"Task", ids: string[], paths: string[]) {
    if(ids.length>100 || paths.length>20 || paths.some(path=>!/^[A-Za-z][A-Za-z0-9.]*$/.test(path)) || ids.some(id=>!/^[A-Za-z0-9_-]{1,100}$/.test(id))) throw new EsxiSoapError("ESXI_PROPERTY_INVALID","ESXi property request is invalid.");
    if(ids.length===0) return new Map<string,Map<string,XmlNode>>();
    const collector=field(this.content,"propertyCollector");
    if(!collector) throw new EsxiSoapError("ESXI_SERVICE_INVALID","ESXi property collector is missing.");
    const spec=`<_this type="PropertyCollector">${xmlEscape(collector)}</_this><specSet><propSet><type>${type}</type>${paths.map(path=>`<pathSet>${path}</pathSet>`).join("")}</propSet>${ids.map(id=>`<objectSet><obj type="${type}">${id}</obj></objectSet>`).join("")}</specSet><options/>`;
    const found=new Map<string,Map<string,XmlNode>>();
    let response=await this.call("RetrievePropertiesEx",spec);
    for(let page=0;page<10;page++) {
      const result=child(response,"returnval");
      for(const object of children(result,"objects")) {
        const id=field(object,"obj"),props=new Map<string,XmlNode>();
        for(const prop of children(object,"propSet")) {const name=field(prop,"name"),data=child(prop,"val");if(name&&data)props.set(name,data);}
        if(id) found.set(id,props);
      }
      const token=field(result,"token");
      if(!token) return found;
      response=await this.call("ContinueRetrievePropertiesEx",`<_this type="PropertyCollector">${xmlEscape(collector)}</_this><token>${xmlEscape(token)}</token>`);
    }
    throw new EsxiSoapError("ESXI_RESULT_TRUNCATED","ESXi property result exceeded the safe pagination limit.");
  }
}

export function references(node: XmlNode | undefined, type: string) {
  const refs: string[]=[];
  const visit=(current:XmlNode|undefined)=>{
    if(!current) return;
    if(current.attributes.type===type && /^[A-Za-z0-9_-]{1,100}$/.test(value(current))) refs.push(value(current));
    for(const nested of current.children) visit(nested);
  };
  visit(node);return [...new Set(refs)];
}
