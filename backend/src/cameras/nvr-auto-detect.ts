import {cameraHttp,cameraPort,cameraUrl,CameraError,privateCameraHost} from "./camera-network.js";
type Result={mode:"appweb"|"onvif";port:number;https:boolean;path:string};
/** Identify fixed services without credentials. No port sweep/trial passwords. */
export async function detectNvrConnection(host:string,port=80,https=false,path="/onvif/device_service"):Promise<Result>{
  privateCameraHost(host);cameraPort(port);
  const origin=`${https?"https":"http"}://${host}:${port}`;
  try{
    const response=await cameraHttp(cameraUrl(origin+"/doc/script/common.js",host),{timeout:2500,maxBytes:64*1024});
    const script=response.body.toString();
    if(response.status===200&&script.includes("/CGI/Security/")&&script.includes("webSessionID"))return{mode:"appweb",port,https,path};
  }catch{/* The second fixed service can still be available. */}
  try{
    const response=await cameraHttp(cameraUrl(origin+path,host),{timeout:2500,maxBytes:64*1024});
    const body=response.body.toString();
    if(response.status===405||response.status===401&&Boolean(response.headers["www-authenticate"])||response.status===200&&/onvif\.org|schemas\.xmlsoap\.org\/soap|www\.w3\.org\/2003\/05\/soap-envelope/.test(body))return{mode:"onvif",port,https,path};
  }catch{/* Persist as unverified; unsupported is not healthy or offline. */}
  throw new CameraError("NVR_AUTO_DETECT_UNAVAILABLE",422);
}
