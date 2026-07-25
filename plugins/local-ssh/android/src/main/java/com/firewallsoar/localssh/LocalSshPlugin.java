package com.firewallsoar.localssh;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.whitestein.securestorage.SecureStoragePluginPlugin;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.common.IOUtils;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.HostKeyVerifier;
import net.schmizz.sshj.userauth.keyprovider.KeyProvider;
import net.schmizz.sshj.userauth.password.PasswordUtils;
import org.json.JSONObject;

@CapacitorPlugin(name = "LocalSsh")
public class LocalSshPlugin extends Plugin {
    private final ConcurrentMap<String, SSHClient> running = new ConcurrentHashMap<>();
    private final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final LocalSshNativeCore core = new LocalSshNativeCore();

    @PluginMethod
    public void getHostKey(PluginCall call) {
        String host = call.getString("host", "");
        Integer port = call.getInt("port", 22);
        if (host.isBlank()) {
            call.reject("LOCAL_SSH_HOST_REQUIRED");
            return;
        }
        SSHClient client = new SSHClient();
        final JSObject captured = new JSObject();
        client.addHostKeyVerifier(new HostKeyVerifier() {
            @Override
            public boolean verify(String hostname, int remotePort, PublicKey key) {
                captured.put("host", hostname);
                captured.put("port", remotePort);
                captured.put("algorithm", key.getAlgorithm());
                captured.put("sha256Fingerprint", sha256Fingerprint(key));
                return false;
            }
        });
        try {
            client.connect(host, port);
        } catch (Exception ignored) {
            // The probe intentionally rejects the key after capture; authentication is never attempted here.
        } finally {
            closeQuietly(client);
        }
        if (!captured.has("sha256Fingerprint")) {
            call.reject("LOCAL_SSH_HOST_KEY_PROBE_FAILED");
            return;
        }
        call.resolve(captured);
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        try {
            LocalSshNativeCore.LocalSshOptions options = optionsFromCall(call, "local-test-connection", true);
            LocalSshNativeCore.Credential credential = credentialFromCall(call);
            executor.execute(() -> {
                SshjTransport transport = new SshjTransport(options);
                try {
                    transport.connect(options);
                    transport.authenticate(options.username, credential);
                    JSObject result = new JSObject();
                    result.put("connected", true);
                    result.put("hostKeyVerified", true);
                    result.put("platform", "ssh");
                    result.put("message", "LOCAL_SSH_CONNECTION_OK");
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(classify(error));
                } finally {
                    transport.close();
                }
            });
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void execute(PluginCall call) {
        try {
            LocalSshNativeCore.LocalSshOptions options = optionsFromCall(call, call.getString("executionId", ""), false);
            LocalSshNativeCore.Credential credential = credentialFromCall(call);
            cancelled.remove(options.executionId);
            executor.execute(() -> runExecution(options, credential));
            JSObject started = new JSObject();
            started.put("executionId", options.executionId);
            started.put("startedAt", Instant.now().toString());
            call.resolve(started);
        } catch (Exception error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String executionId = call.getString("executionId", "");
        if (!executionId.isBlank()) cancelled.add(executionId);
        SSHClient client = running.remove(executionId);
        closeQuietly(client);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        for (Map.Entry<String, SSHClient> entry : running.entrySet()) closeQuietly(entry.getValue());
        running.clear();
        executor.shutdownNow();
    }

    private void runExecution(LocalSshNativeCore.LocalSshOptions options, LocalSshNativeCore.Credential credential) {
        SshjTransport transport = new SshjTransport(options);
        try {
            core.execute(options, credential, transport, (event) -> notifyListeners("sshExecutionEvent", eventToJs(options.executionId, event)), () -> cancelled.contains(options.executionId));
        } catch (Exception error) {
            LocalSshNativeCore.LocalSshEvent event = new LocalSshNativeCore.LocalSshEvent("completed", null, null, null, classify(error));
            notifyListeners("sshExecutionEvent", eventToJs(options.executionId, event));
        } finally {
            running.remove(options.executionId);
            cancelled.remove(options.executionId);
            transport.close();
        }
    }

    private LocalSshNativeCore.LocalSshOptions optionsFromCall(PluginCall call, String executionId, boolean connectionTest) throws Exception {
        String host = call.getString("host", "");
        int port = call.getInt("port", 22);
        String username = call.getString("username", "");
        String trusted = call.getString("trustedHostKeySha256", "");
        int connectTimeoutMs = call.getInt("connectTimeoutMs", 15000);
        int commandTimeoutMs = call.getInt("commandTimeoutMs", 30000);
        int maxOutputBytes = call.getInt("maxOutputBytes", 64000);
        List<LocalSshNativeCore.CommandSpec> commands = connectionTest
            ? List.of(new LocalSshNativeCore.CommandSpec("connection-test", "true", 1000))
            : commandsFromCall(call.getArray("commands"));
        return new LocalSshNativeCore.LocalSshOptions(executionId, host, port, username, trusted, connectTimeoutMs, commandTimeoutMs, maxOutputBytes, commands);
    }

    private List<LocalSshNativeCore.CommandSpec> commandsFromCall(JSArray commands) throws Exception {
        if (commands == null || commands.length() == 0) throw new IllegalArgumentException("LOCAL_SSH_COMMANDS_REQUIRED");
        List<LocalSshNativeCore.CommandSpec> specs = new ArrayList<>();
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.getJSONObject(i);
            specs.add(new LocalSshNativeCore.CommandSpec(
                command.optString("id", "step-" + (i + 1)),
                command.optString("command", ""),
                command.optInt("timeoutMs", 30000)
            ));
        }
        return specs;
    }

    private LocalSshNativeCore.Credential credentialFromCall(PluginCall call) throws Exception {
        String credentialRef = call.getString("credentialRef", "");
        String authMode = call.getString("authMode", "password");
        if (credentialRef.isBlank()) throw new IllegalArgumentException("LOCAL_SSH_CREDENTIAL_REF_REQUIRED");
        String vaultValue = readVaultValue(credentialRef);
        return LocalSshNativeCore.credentialFromVaultValue(authMode, vaultValue);
    }

    private String readVaultValue(String credentialRef) throws Exception {
        SecureStoragePluginPlugin vault = new SecureStoragePluginPlugin();
        vault.loadTextContext(getContext());
        JSObject result = vault._get("firewall.local.vault." + credentialRef);
        String value = result.getString("value");
        if (value == null || value.isBlank()) throw new IllegalArgumentException("LOCAL_SSH_CREDENTIAL_NOT_FOUND");
        return value;
    }

    private JSObject eventToJs(String executionId, LocalSshNativeCore.LocalSshEvent event) {
        JSObject js = new JSObject();
        js.put("executionId", executionId);
        js.put("type", event.type);
        if (event.stepId != null) js.put("stepId", event.stepId);
        if (event.data != null) js.put("data", event.data);
        if (event.exitCode != null) js.put("exitCode", event.exitCode);
        if (event.message != null) js.put("message", event.message);
        js.put("createdAt", Instant.now().toString());
        return js;
    }

    private HostKeyVerifier pinnedVerifier(String trustedSha256) {
        return (hostname, port, key) -> trustedSha256.equals(sha256Fingerprint(key));
    }

    private static String sha256Fingerprint(PublicKey key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getEncoded());
            return "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP).replace("=", "");
        } catch (Exception error) {
            throw new IllegalStateException("LOCAL_SSH_FINGERPRINT_FAILED", error);
        }
    }

    private static String classify(Exception error) {
        Throwable current = error;
        while (current != null) {
            String message = String.valueOf(current.getMessage());
            if (message.startsWith("LOCAL_SSH_")) return message;
            current = current.getCause();
        }
        return "LOCAL_SSH_EXECUTION_FAILED";
    }

    private static void closeQuietly(SSHClient client) {
        if (client == null) return;
        try {
            client.close();
        } catch (Exception ignored) {
        }
    }

    private final class SshjTransport implements LocalSshNativeCore.Transport {
        private final LocalSshNativeCore.LocalSshOptions options;
        private SSHClient client;

        SshjTransport(LocalSshNativeCore.LocalSshOptions options) {
            this.options = options;
        }

        @Override
        public void connect(LocalSshNativeCore.LocalSshOptions ignored) throws Exception {
            client = new SSHClient();
            client.addHostKeyVerifier(pinnedVerifier(options.trustedHostKeySha256));
            client.setConnectTimeout(options.connectTimeoutMs);
            client.setTimeout(options.commandTimeoutMs);
            running.put(options.executionId, client);
            client.connect(options.host, options.port);
        }

        @Override
        public void authenticate(String username, LocalSshNativeCore.Credential credential) throws Exception {
            if (client == null) throw new IllegalStateException("LOCAL_SSH_NOT_CONNECTED");
            if ("private_key".equals(credential.authMode)) {
                KeyProvider keyProvider = client.loadKeys(credential.secret, null, PasswordUtils.createOneOff(credential.passphrase == null ? new char[0] : credential.passphrase.toCharArray()));
                client.authPublickey(username, keyProvider);
            } else {
                client.authPassword(username, credential.secret);
            }
        }

        @Override
        public LocalSshNativeCore.CommandResult execute(String command, int timeoutMs, int maxOutputBytes) throws Exception {
            if (client == null) throw new IllegalStateException("LOCAL_SSH_NOT_CONNECTED");
            try (Session session = client.startSession()) {
                Session.Command sshCommand = session.exec(command);
                sshCommand.join(timeoutMs, TimeUnit.MILLISECONDS);
                if (!sshCommand.isOpen() && sshCommand.getExitStatus() == null) throw new TimeoutException("LOCAL_SSH_TIMEOUT");
                String stdout = readBounded(sshCommand.getInputStream(), maxOutputBytes);
                String stderr = readBounded(sshCommand.getErrorStream(), maxOutputBytes);
                Integer exit = sshCommand.getExitStatus();
                return new LocalSshNativeCore.CommandResult(stdout, stderr, exit == null ? 124 : exit);
            }
        }

        @Override
        public void close() {
            closeQuietly(client);
        }
    }

    private static String readBounded(java.io.InputStream stream, int maxOutputBytes) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(4096, Math.max(1024, maxOutputBytes)));
        IOUtils.copy(stream, output);
        String text = output.toString(StandardCharsets.UTF_8);
        return LocalSshNativeCore.sanitize(text, maxOutputBytes);
    }
}
