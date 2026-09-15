package com.firewallsoar.localssh;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeoutException;
import org.junit.Test;

public class LocalSshNativeCoreTest {
    @Test
    public void successEmitsStepAndCompletionEvents() throws Exception {
        Fixture fixture = new Fixture();
        fixture.results.add(new LocalSshNativeCore.CommandResult("ok\n", "", 0));

        LocalSshNativeCore.ExecutionSummary summary = fixture.run();

        assertEquals("succeeded", summary.status);
        assertEquals(0, summary.exitCode);
        assertEquals("ok\n", summary.stdout);
        assertTrue(fixture.eventTypes().contains("started"));
        assertTrue(fixture.eventTypes().contains("step_succeeded"));
        assertTrue(fixture.eventTypes().contains("completed"));
        assertTrue(fixture.closed);
    }

    @Test
    public void authenticationFailureIsClassifiedAndClosesTransport() {
        Fixture fixture = new Fixture();
        fixture.authFailure = true;

        Exception error = fixture.expectFailure();

        assertEquals("LOCAL_SSH_AUTHENTICATION_FAILED", error.getMessage());
        assertTrue(fixture.closed);
    }

    @Test
    public void hostKeyMismatchIsClassifiedBeforeCommandsRun() {
        Fixture fixture = new Fixture();
        fixture.hostKeyMismatch = true;

        Exception error = fixture.expectFailure();

        assertEquals("LOCAL_SSH_HOST_KEY_MISMATCH", error.getMessage());
        assertEquals(0, fixture.commandsRun);
        assertTrue(fixture.closed);
    }

    @Test
    public void timeoutIsClassifiedAndEmitsTerminalEvent() {
        Fixture fixture = new Fixture();
        fixture.timeout = true;

        Exception error = fixture.expectFailure();

        assertEquals("LOCAL_SSH_TIMEOUT", error.getMessage());
        assertTrue(fixture.eventTypes().contains("completed"));
        assertTrue(fixture.closed);
    }

    @Test
    public void cancellationReturnsCancelledSummaryAndClosesTransport() throws Exception {
        Fixture fixture = new Fixture();
        fixture.cancelled = true;

        LocalSshNativeCore.ExecutionSummary summary = fixture.run();

        assertEquals("cancelled", summary.status);
        assertTrue(fixture.eventTypes().contains("cancelled"));
        assertTrue(fixture.closed);
    }

    @Test
    public void recoveryCanResumeObservationFromPersistedExecutingState() throws Exception {
        Fixture fixture = new Fixture();
        fixture.results.add(new LocalSshNativeCore.CommandResult("recovered\n", "", 0));

        LocalSshNativeCore.ExecutionSummary summary = fixture.run();

        assertEquals("succeeded", summary.status);
        assertFalse(summary.stdout.contains("secret="));
        assertTrue(fixture.connected);
        assertTrue(fixture.authenticated);
    }

    @Test
    public void credentialParserKeepsPlaintextOutOfStructuredParameters() {
        LocalSshNativeCore.Credential credential = LocalSshNativeCore.credentialFromVaultValue("password", "{\"password\":\"lab-secret\",\"label\":\"fixture\"}");

        assertEquals("password", credential.authMode);
        assertEquals("lab-secret", credential.secret);
        assertEquals("token=[redacted]", LocalSshNativeCore.sanitize("token=lab-secret", 4096));
    }

    private static final class Fixture implements LocalSshNativeCore.Transport {
        final LocalSshNativeCore core = new LocalSshNativeCore();
        final List<LocalSshNativeCore.CommandResult> results = new ArrayList<>();
        final List<LocalSshNativeCore.LocalSshEvent> events = new ArrayList<>();
        boolean connected;
        boolean authenticated;
        boolean closed;
        boolean authFailure;
        boolean hostKeyMismatch;
        boolean timeout;
        boolean cancelled;
        int commandsRun;

        LocalSshNativeCore.ExecutionSummary run() throws Exception {
            return core.execute(
                new LocalSshNativeCore.LocalSshOptions("fixture-exec", "127.0.0.1", 22, "operator", "SHA256:fixture", 1000, 1000, 4096, List.of(new LocalSshNativeCore.CommandSpec("step-1", "show version", 1000))),
                new LocalSshNativeCore.Credential("password", "credential-ref-fixture", null),
                this,
                events::add,
                () -> cancelled
            );
        }

        Exception expectFailure() {
            try {
                run();
                throw new AssertionError("Expected fixture failure");
            } catch (Exception error) {
                return error;
            }
        }

        List<String> eventTypes() {
            return events.stream().map((event) -> event.type).toList();
        }

        @Override
        public void connect(LocalSshNativeCore.LocalSshOptions options) throws Exception {
            if (hostKeyMismatch) throw new Exception("host key mismatch");
            connected = true;
        }

        @Override
        public void authenticate(String username, LocalSshNativeCore.Credential credential) throws Exception {
            if (authFailure) throw new Exception("authentication failed");
            authenticated = true;
        }

        @Override
        public LocalSshNativeCore.CommandResult execute(String command, int timeoutMs, int maxOutputBytes) throws Exception {
            commandsRun += 1;
            if (timeout) throw new TimeoutException("timed out");
            return results.isEmpty() ? new LocalSshNativeCore.CommandResult("", "", 0) : results.remove(0);
        }

        @Override
        public void close() {
            closed = true;
        }
    }
}
