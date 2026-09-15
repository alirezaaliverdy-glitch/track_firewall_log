import { LocalMobileRuntime } from "@/mobile-local/LocalMobileRuntime";
import { ServerRuntimeClient } from "@/runtime/ServerRuntimeClient";
import type { ExecutionRuntime, RuntimeKind } from "../../packages/runtime-contracts/src/index";

export class RuntimeFacade {
  private readonly server: ExecutionRuntime;
  private readonly local: ExecutionRuntime;
  private selected: RuntimeKind;

  constructor(input: { server?: ExecutionRuntime; local?: ExecutionRuntime; defaultKind?: RuntimeKind } = {}) {
    this.server = input.server ?? new ServerRuntimeClient();
    this.local = input.local ?? new LocalMobileRuntime();
    this.selected = input.defaultKind ?? runtimeKindFromEnvironment();
  }

  get kind() {
    return this.selected;
  }

  use(kind: RuntimeKind) {
    this.selected = kind;
  }

  current(): ExecutionRuntime {
    return this.selected === "local-mobile" ? this.local : this.server;
  }
}

export function runtimeKindFromEnvironment(): RuntimeKind {
  const configured = import.meta.env.VITE_RUNTIME_MODE;
  if (configured === "local-mobile" || configured === "server") return configured;
  if (typeof localStorage !== "undefined" && localStorage.getItem("firewall.runtime") === "local-mobile") return "local-mobile";
  return "server";
}

export const runtimeFacade = new RuntimeFacade();
