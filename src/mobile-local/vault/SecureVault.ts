import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";

export type VaultSecretKind = "password" | "private_key" | "passphrase" | "ai_api_key";

export type VaultSecretMetadata = {
  ref: string;
  kind: VaultSecretKind;
  label: string;
  createdAt: string;
};

function vaultKey(ref: string) {
  return `firewall.local.vault.${ref}`;
}

export class SecureVault {
  async storeSecret(input: { ref: string; kind: VaultSecretKind; label: string; value: string }) {
    if (!input.value) throw new Error("VAULT_SECRET_VALUE_REQUIRED");
    await SecureStoragePlugin.set({ key: vaultKey(input.ref), value: input.value });
    return {
      ref: input.ref,
      kind: input.kind,
      label: input.label,
      createdAt: new Date().toISOString()
    } satisfies VaultSecretMetadata;
  }

  async removeSecret(ref: string) {
    await SecureStoragePlugin.remove({ key: vaultKey(ref) });
  }

  async hasSecret(ref: string) {
    const keys = await SecureStoragePlugin.keys();
    return keys.value.includes(vaultKey(ref));
  }

  async getSecretForNativeHandoff(ref: string) {
    return SecureStoragePlugin.get({ key: vaultKey(ref) });
  }
}
