import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { closeTerminal, inputTerminal, openTerminal, prepareTerminal, readTerminal, resizeTerminal, stopTerminals, terminalMetadata, type TerminalActor } from "../terminal/terminal.service.js";
import { TerminalError } from "../terminal/terminal-runtime.js";

export const terminalRoutes: FastifyPluginAsync = async app => {
  const who=(request:FastifyRequest):TerminalActor=>{
    if(!request.authUser||!request.authSessionToken)throw new TerminalError("TERMINAL_ADMIN_REQUIRED",403);
    return {user:request.authUser,token:request.authSessionToken};
  };
  app.addHook("onSend",async(_request,reply,payload)=>{reply.header("Cache-Control","no-store");reply.header("X-Content-Type-Options","nosniff");return payload;});
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof TerminalError)return reply.code(error.statusCode).send({code:error.code});
    return reply.code(503).send({code:"TERMINAL_SERVICE_UNAVAILABLE"});
  });
  app.get<{Params:{id:string}}>("/api/devices/:id/terminal",async request=>terminalMetadata(request.params.id,who(request)));
  app.post<{Params:{id:string}}>("/api/devices/:id/terminal/preview",{bodyLimit:1024},async request=>prepareTerminal(request.params.id,who(request)));
  app.post<{Params:{id:string};Body:Record<string,unknown>}>("/api/devices/:id/terminal/sessions",{bodyLimit:2048},async(request,reply)=>reply.code(201).send(await openTerminal(request.params.id,who(request),request.body??{})));
  app.get<{Params:{id:string};Querystring:{cursor?:string}}>("/api/terminal-sessions/:id",async request=>readTerminal(request.params.id,who(request),Number(request.query.cursor??0)));
  app.post<{Params:{id:string};Body:{sequence:number;data:string}}>("/api/terminal-sessions/:id/input",{bodyLimit:96*1024},async request=>inputTerminal(request.params.id,who(request),request.body?.sequence,request.body?.data));
  app.post<{Params:{id:string};Body:{cols:number;rows:number}}>("/api/terminal-sessions/:id/resize",{bodyLimit:1024},async request=>resizeTerminal(request.params.id,who(request),request.body?.cols,request.body?.rows));
  app.post<{Params:{id:string}}>("/api/terminal-sessions/:id/close",{bodyLimit:1024},async request=>closeTerminal(request.params.id,who(request)));
  app.addHook("onClose",async()=>stopTerminals());
};
