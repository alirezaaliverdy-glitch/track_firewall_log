import Capacitor
import CryptoKit
import Foundation

@objc(LocalSshPlugin)
public class LocalSshPlugin: CAPPlugin {
    private var cancelled = Set<String>()

    @objc func getHostKey(_ call: CAPPluginCall) {
        call.reject("LOCAL_SSH_IOS_HOST_KEY_PROBE_PENDING_CITADEL_WIRING")
    }

    @objc func testConnection(_ call: CAPPluginCall) {
        guard call.getString("trustedHostKeySha256")?.isEmpty == false else {
            call.reject("LOCAL_SSH_TRUSTED_HOST_KEY_REQUIRED")
            return
        }
        call.reject("LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED")
    }

    @objc func execute(_ call: CAPPluginCall) {
        guard let executionId = call.getString("executionId"), !executionId.isEmpty else {
            call.reject("LOCAL_SSH_EXECUTION_ID_REQUIRED")
            return
        }
        guard call.getString("trustedHostKeySha256")?.isEmpty == false else {
            call.reject("LOCAL_SSH_TRUSTED_HOST_KEY_REQUIRED")
            return
        }
        call.reject("LOCAL_SSH_NATIVE_VAULT_HANDOFF_REQUIRED")
    }

    @objc func cancel(_ call: CAPPluginCall) {
        if let executionId = call.getString("executionId") {
            cancelled.insert(executionId)
        }
        call.resolve()
    }

    private func fingerprintSHA256(_ data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return "SHA256:" + Data(digest).base64EncodedString().replacingOccurrences(of: "=", with: "")
    }
}
