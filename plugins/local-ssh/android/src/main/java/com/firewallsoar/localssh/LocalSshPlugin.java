package com.firewallsoar.localssh;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import net.schmizz.sshj.SSHClient;
import net.schmizz.sshj.connection.channel.direct.Session;
import net.schmizz.sshj.transport.verification.HostKeyVerifier;

@CapacitorPlugin(name = "LocalSsh")
public class LocalSshPlugin extends Plugin {
    private final Map<String, SSHClient> running = new ConcurrentHashMap<>();

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
        call.reject("LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED");
    }

    @PluginMethod
    public void execute(PluginCall call) {
        String executionId = call.getString("executionId", "");
        String trusted = call.getString("trustedHostKeySha256", "");
        JSArray commands = call.getArray("commands");
        if (executionId.isBlank() || trusted.isBlank() || commands == null || commands.length() == 0) {
            call.reject("LOCAL_SSH_EXECUTION_INPUT_INVALID");
            return;
        }
        call.reject("LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED");
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String executionId = call.getString("executionId", "");
        SSHClient client = running.remove(executionId);
        closeQuietly(client);
        call.resolve();
    }

    private Session.Command runVerifiedCommand(SSHClient client, String command, int timeoutMs, int maxOutputBytes) throws Exception {
        Session session = client.startSession();
        Session.Command sshCommand = session.exec(command);
        sshCommand.join(timeoutMs, TimeUnit.MILLISECONDS);
        ByteArrayOutputStream stdout = new ByteArrayOutputStream(Math.max(1024, maxOutputBytes));
        sshCommand.getInputStream().transferTo(stdout);
        sanitize(stdout.toString(StandardCharsets.UTF_8), maxOutputBytes);
        session.close();
        return sshCommand;
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

    private static String sanitize(String value, int maxOutputBytes) {
        String clean = value.replaceAll("\\u001B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])", "");
        return clean.length() > maxOutputBytes ? clean.substring(0, maxOutputBytes) : clean;
    }

    private static void closeQuietly(SSHClient client) {
        if (client == null) return;
        try {
            client.close();
        } catch (Exception ignored) {
        }
    }
}
