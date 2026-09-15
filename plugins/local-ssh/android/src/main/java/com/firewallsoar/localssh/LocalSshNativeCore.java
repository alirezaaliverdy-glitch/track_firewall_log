package com.firewallsoar.localssh;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeoutException;

final class LocalSshNativeCore {
    interface Transport {
        void connect(LocalSshOptions options) throws Exception;
        void authenticate(String username, Credential credential) throws Exception;
        CommandResult execute(String command, int timeoutMs, int maxOutputBytes) throws Exception;
        void close();
    }

    interface EventSink {
        void emit(LocalSshEvent event);
    }

    interface CancellationToken {
        boolean isCancelled();
    }

    static final class LocalSshOptions {
        final String executionId;
        final String host;
        final int port;
        final String username;
        final String trustedHostKeySha256;
        final int connectTimeoutMs;
        final int commandTimeoutMs;
        final int maxOutputBytes;
        final List<CommandSpec> commands;

        LocalSshOptions(String executionId, String host, int port, String username, String trustedHostKeySha256, int connectTimeoutMs, int commandTimeoutMs, int maxOutputBytes, List<CommandSpec> commands) {
            this.executionId = required(executionId, "LOCAL_SSH_EXECUTION_ID_REQUIRED");
            this.host = required(host, "LOCAL_SSH_HOST_REQUIRED");
            this.port = port > 0 ? port : 22;
            this.username = required(username, "LOCAL_SSH_USERNAME_REQUIRED");
            this.trustedHostKeySha256 = required(trustedHostKeySha256, "LOCAL_SSH_TRUSTED_HOST_KEY_REQUIRED");
            this.connectTimeoutMs = connectTimeoutMs > 0 ? connectTimeoutMs : 15000;
            this.commandTimeoutMs = commandTimeoutMs > 0 ? commandTimeoutMs : 30000;
            this.maxOutputBytes = maxOutputBytes > 0 ? maxOutputBytes : 64000;
            if (commands == null || commands.isEmpty()) throw new IllegalArgumentException("LOCAL_SSH_COMMANDS_REQUIRED");
            this.commands = List.copyOf(commands);
        }
    }

    static final class CommandSpec {
        final String id;
        final String command;
        final int timeoutMs;

        CommandSpec(String id, String command, int timeoutMs) {
            this.id = required(id, "LOCAL_SSH_COMMAND_ID_REQUIRED");
            this.command = required(command, "LOCAL_SSH_COMMAND_REQUIRED");
            this.timeoutMs = timeoutMs > 0 ? timeoutMs : 30000;
        }
    }

    static final class Credential {
        final String authMode;
        final String secret;
        final String passphrase;

        Credential(String authMode, String secret, String passphrase) {
            this.authMode = "private_key".equals(authMode) ? "private_key" : "password";
            this.secret = required(secret, "LOCAL_SSH_CREDENTIAL_SECRET_REQUIRED");
            this.passphrase = passphrase == null || passphrase.isBlank() ? null : passphrase;
        }
    }

    static final class CommandResult {
        final String stdout;
        final String stderr;
        final int exitCode;

        CommandResult(String stdout, String stderr, int exitCode) {
            this.stdout = stdout == null ? "" : stdout;
            this.stderr = stderr == null ? "" : stderr;
            this.exitCode = exitCode;
        }
    }

    static final class ExecutionSummary {
        final String status;
        final int exitCode;
        final String stdout;
        final String stderr;

        ExecutionSummary(String status, int exitCode, String stdout, String stderr) {
            this.status = status;
            this.exitCode = exitCode;
            this.stdout = stdout == null ? "" : stdout;
            this.stderr = stderr == null ? "" : stderr;
        }
    }

    static final class LocalSshEvent {
        final String type;
        final String stepId;
        final String data;
        final Integer exitCode;
        final String message;

        LocalSshEvent(String type, String stepId, String data, Integer exitCode, String message) {
            this.type = type;
            this.stepId = stepId;
            this.data = data;
            this.exitCode = exitCode;
            this.message = message;
        }
    }

    ExecutionSummary execute(LocalSshOptions options, Credential credential, Transport transport, EventSink sink, CancellationToken cancellation) throws Exception {
        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        sink.emit(new LocalSshEvent("started", null, null, null, "Local SSH execution started."));
        try {
            checkCancelled(cancellation);
            transport.connect(options);
            checkCancelled(cancellation);
            transport.authenticate(options.username, credential);
            for (CommandSpec command : options.commands) {
                checkCancelled(cancellation);
                CommandResult result = transport.execute(command.command, Math.min(command.timeoutMs, options.commandTimeoutMs), options.maxOutputBytes);
                String cleanStdout = sanitize(result.stdout, options.maxOutputBytes);
                String cleanStderr = sanitize(result.stderr, options.maxOutputBytes);
                appendBounded(stdout, cleanStdout, options.maxOutputBytes);
                appendBounded(stderr, cleanStderr, options.maxOutputBytes);
                if (!cleanStdout.isEmpty()) sink.emit(new LocalSshEvent("stdout", command.id, cleanStdout, null, null));
                if (!cleanStderr.isEmpty()) sink.emit(new LocalSshEvent("stderr", command.id, cleanStderr, null, null));
                if (result.exitCode == 0) {
                    sink.emit(new LocalSshEvent("step_succeeded", command.id, null, 0, "Command completed."));
                } else {
                    sink.emit(new LocalSshEvent("step_failed", command.id, null, result.exitCode, "Command failed."));
                    sink.emit(new LocalSshEvent("completed", null, null, result.exitCode, "Local SSH execution failed."));
                    return new ExecutionSummary("failed", result.exitCode, stdout.toString(), stderr.toString());
                }
            }
            sink.emit(new LocalSshEvent("completed", null, null, 0, "Local SSH execution completed."));
            return new ExecutionSummary("succeeded", 0, stdout.toString(), stderr.toString());
        } catch (TimeoutException error) {
            sink.emit(new LocalSshEvent("completed", null, null, null, "Local SSH execution timed out."));
            throw new LocalSshException("LOCAL_SSH_TIMEOUT", error);
        } catch (LocalSshCancelledException error) {
            sink.emit(new LocalSshEvent("cancelled", null, null, null, "Local SSH execution cancelled."));
            return new ExecutionSummary("cancelled", 130, stdout.toString(), stderr.toString());
        } catch (LocalSshException error) {
            sink.emit(new LocalSshEvent("completed", null, null, null, error.getMessage()));
            throw error;
        } catch (Exception error) {
            String code = classify(error);
            sink.emit(new LocalSshEvent("completed", null, null, null, code));
            throw new LocalSshException(code, error);
        } finally {
            transport.close();
        }
    }

    static Credential credentialFromVaultValue(String authMode, String value) {
        String trimmed = required(value, "LOCAL_SSH_CREDENTIAL_SECRET_REQUIRED").trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            String secret = jsonString(trimmed, "secret");
            if (secret == null) secret = jsonString(trimmed, "password");
            if (secret == null) secret = jsonString(trimmed, "privateKey");
            return new Credential(authMode, secret, jsonString(trimmed, "passphrase"));
        }
        return new Credential(authMode, trimmed, null);
    }

    static String sanitize(String value, int maxOutputBytes) {
        String clean = (value == null ? "" : value)
            .replaceAll("\\u001B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])", "")
            .replaceAll("(?i)(password|passphrase|private[_ -]?key|api[_ -]?key|token|secret)\\s*[:=]\\s*\\S+", "$1=[redacted]");
        return clean.length() > maxOutputBytes ? clean.substring(0, maxOutputBytes) : clean;
    }

    static List<CommandSpec> commandSpecsFromArrays(List<String> ids, List<String> commands, List<Integer> timeouts) {
        if (commands == null || commands.isEmpty()) throw new IllegalArgumentException("LOCAL_SSH_COMMANDS_REQUIRED");
        List<CommandSpec> specs = new ArrayList<>();
        for (int i = 0; i < commands.size(); i++) {
            String id = ids != null && i < ids.size() ? ids.get(i) : "step-" + (i + 1);
            int timeout = timeouts != null && i < timeouts.size() ? timeouts.get(i) : 30000;
            specs.add(new CommandSpec(id, commands.get(i), timeout));
        }
        return specs;
    }

    private static void checkCancelled(CancellationToken cancellation) {
        if (cancellation != null && cancellation.isCancelled()) throw new LocalSshCancelledException();
    }

    private static void appendBounded(StringBuilder target, String value, int maxOutputBytes) {
        if (value == null || value.isEmpty() || target.length() >= maxOutputBytes) return;
        int remaining = maxOutputBytes - target.length();
        target.append(value, 0, Math.min(value.length(), remaining));
    }

    private static String required(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(code);
        return value;
    }

    private static String classify(Exception error) {
        String message = String.valueOf(error.getMessage()).toLowerCase(Locale.ROOT);
        if (message.contains("host key") || message.contains("key verify")) return "LOCAL_SSH_HOST_KEY_MISMATCH";
        if (message.contains("auth") || message.contains("credential") || message.contains("password")) return "LOCAL_SSH_AUTHENTICATION_FAILED";
        if (message.contains("timeout") || message.contains("timed out")) return "LOCAL_SSH_TIMEOUT";
        return "LOCAL_SSH_EXECUTION_FAILED";
    }

    private static String jsonString(String json, String key) {
        String pattern = "\"" + key + "\"";
        int at = json.indexOf(pattern);
        if (at < 0) return null;
        int colon = json.indexOf(':', at + pattern.length());
        if (colon < 0) return null;
        int firstQuote = json.indexOf('"', colon + 1);
        if (firstQuote < 0) return null;
        StringBuilder value = new StringBuilder();
        boolean escaped = false;
        for (int i = firstQuote + 1; i < json.length(); i++) {
            char ch = json.charAt(i);
            if (escaped) {
                value.append(ch == 'n' ? '\n' : ch == 'r' ? '\r' : ch == 't' ? '\t' : ch);
                escaped = false;
            } else if (ch == '\\') {
                escaped = true;
            } else if (ch == '"') {
                return value.toString();
            } else {
                value.append(ch);
            }
        }
        return null;
    }

    static final class LocalSshException extends Exception {
        LocalSshException(String code, Throwable cause) {
            super(code, cause);
        }
    }

    static final class LocalSshCancelledException extends RuntimeException {
    }
}
