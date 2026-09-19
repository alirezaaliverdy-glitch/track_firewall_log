# AI assistant runtime on Docker Desktop

The assistant uses the configured OpenRouter-compatible provider. On this Windows Docker Desktop environment, direct container traffic to OpenRouter can be rejected, so the project includes a restricted authenticated CONNECT proxy. The proxy accepts private-network clients only, permits only `openrouter.ai:443`, and never stores or receives the OpenRouter API key outside the encrypted TLS connection.

Start or verify the proxy after a Windows restart:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-openrouter-host-proxy.ps1
```

The ignored `.runtime/openrouter-proxy.env` keeps the generated proxy credential. Docker resolves the stable `host.docker.internal` name through its `host-gateway` mapping, so changing Hyper-V adapter addresses no longer require editing configuration or recreating the API container.

Run the safe provider probe when troubleshooting:

```powershell
docker cp .\scripts\diagnose-ai-provider-runtime.mjs firewall-api:/tmp/diagnose-ai-provider-runtime.mjs
docker exec firewall-api node /tmp/diagnose-ai-provider-runtime.mjs --application-provider
```

The probe reports only provider status, model, and whether an assistant message was received. It never prints the API key or response text.
