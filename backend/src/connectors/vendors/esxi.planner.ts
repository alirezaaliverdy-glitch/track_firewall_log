import { ActionType } from "@prisma/client";
import type { PlannerInput, VendorCommandPlan, VendorPlanner } from "../types.js";

const allowed=new Set(["esxi.inventory","esxi.enter-maintenance","esxi.exit-maintenance","esxi.start-service","esxi.stop-service","esxi.set-ntp"]);
export const esxiPlanner:VendorPlanner={
  vendor:"esxi",supportedActions:[ActionType.generic_security_action],
  supports(device){return Boolean(device?.vendor.toLowerCase()==="esxi"&&device.protocol==="api");},
  plan(input:PlannerInput):VendorCommandPlan {
    const raw=input.parameters.metadata;
    const metadata=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    const id=String(metadata.catalogCommandId??metadata.executionTemplateRef??"");
    if(!allowed.has(id)) return {status:"unsupported",vendor:"esxi",deviceId:input.device?.id??null,actionType:input.actionType,transport:"manual",commands:[],apiCalls:[],warnings:[],rollbackSteps:[],riskLevel:input.riskLevel,requiresApproval:true,unsupportedReason:"Only registered ESXi host operations are allowed."};
    const write=id!=="esxi.inventory";
    return {status:"planned",vendor:"esxi",deviceId:input.device?.id??null,actionType:input.actionType,transport:"api",commands:[],apiCalls:[{method:"POST",path:"/sdk",description:id}],warnings:write?["Host state is checked again immediately before execution. Changes may interrupt management connectivity."]:[],rollbackSteps:write?["A separate approved host operation is required."]:[],riskLevel:input.riskLevel,requiresApproval:write};
  }
};
