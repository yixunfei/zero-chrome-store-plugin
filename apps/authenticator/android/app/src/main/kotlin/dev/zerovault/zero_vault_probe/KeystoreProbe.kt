package dev.zerovault.zero_vault_probe

import android.os.Build
import android.content.Context
import android.app.KeyguardManager
import android.hardware.biometrics.BiometricManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.KeyAgreement

/** Diagnostic only: no private key or ECDH secret is returned to Dart. */
class KeystoreProbe(private val context: Context) {
    private val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun create(alias: String, purpose: Int, timeout: Int): KeyPair {
        if (store.containsAlias(alias)) store.deleteEntry(alias)
        val spec = KeyGenParameterSpec.Builder(alias, purpose)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(timeout, KeyProperties.AUTH_BIOMETRIC_STRONG)
        if (purpose == KeyProperties.PURPOSE_SIGN) spec.setDigests(KeyProperties.DIGEST_SHA256)
        return KeyPairGenerator.getInstance("EC", "AndroidKeyStore").run {
            initialize(spec.build()); generateKeyPair()
        }
    }

    private fun metadata(pair: KeyPair): Map<String, Any> {
        val info = KeyFactory.getInstance(pair.private.algorithm, "AndroidKeyStore")
            .getKeySpec(pair.private, KeyInfo::class.java)
        val hardware = info.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
            info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
        return mapOf(
            "securityLevel" to info.securityLevel, "hardwareReported" to hardware,
            "privateEncodedIsNull" to (pair.private.encoded == null),
            "authenticationRequired" to info.isUserAuthenticationRequired,
            "authenticationHardwareEnforced" to info.isUserAuthenticationRequirementEnforcedBySecureHardware,
            "authenticationTimeoutSeconds" to info.userAuthenticationValidityDurationSeconds,
            "physicalDeviceVerification" to "PENDING; emulator metadata is not hardware evidence"
        )
    }

    fun inspect(): Map<String, Any> {
        val report = mutableMapOf<String, Any>(
            "api" to Build.VERSION.SDK_INT, "manufacturer" to Build.MANUFACTURER,
            "model" to Build.MODEL, "fingerprint" to Build.FINGERPRINT,
            "deviceSecure" to context.getSystemService(KeyguardManager::class.java).isDeviceSecure,
            "strongBiometricStatus" to context.getSystemService(BiometricManager::class.java)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG),
            "hpkeKeystoreIntegration" to "NOT_IMPLEMENTED; library adapter gate remains open"
        )
        for ((name, timeout) in listOf("ecdh-per-use" to 0, "ecdh-window-30s" to 30)) {
            try {
                val pair = create("zv.p1.$name", KeyProperties.PURPOSE_AGREE_KEY, timeout)
                val detail = metadata(pair).toMutableMap()
                try {
                    agree(pair)
                    detail["withoutNewPrompt"] = "SUCCEEDED; investigate existing authentication window"
                } catch (e: Exception) { detail["withoutNewPrompt"] = e.javaClass.simpleName }
                report[name] = detail
            } catch (e: Exception) { report[name] = mapOf("error" to e.javaClass.simpleName) }
        }
        return report
    }

    private fun agree(pair: KeyPair): Boolean {
        val peer = KeyPairGenerator.getInstance("EC").run {
            initialize(ECGenParameterSpec("secp256r1")); generateKeyPair()
        }
        val secret = KeyAgreement.getInstance("ECDH", "AndroidKeyStore").run {
            init(pair.private); doPhase(peer.public, true); generateSecret()
        }
        val expected = KeyAgreement.getInstance("ECDH").run {
            init(peer.private); doPhase(pair.public, true); generateSecret()
        }
        val equal = java.security.MessageDigest.isEqual(secret, expected)
        secret.fill(0); expected.fill(0)
        check(equal) { "ECDH disagreement" }
        return true
    }

    fun authenticatedWindowAgreement(): Map<String, Any> {
        val alias = "zv.p1.ecdh-window-30s"
        check(store.containsAlias(alias)) { "Run inspection first" }
        val pair = KeyPair(store.getCertificate(alias).publicKey, store.getKey(alias, null) as java.security.PrivateKey)
        return metadata(pair) + mapOf("ecdhMatchesPeer" to agree(pair), "mode" to "30-second window, NOT per-operation HPKE approval")
    }

    fun prepareSignature(): Pair<Signature, Map<String, Any>> {
        val pair = create("zv.p1.signature", KeyProperties.PURPOSE_SIGN, 0)
        val info = metadata(pair)
        check(info["hardwareReported"] == true) { "Hardware unavailable; no software fallback" }
        return Signature.getInstance("SHA256withECDSA").apply { initSign(pair.private) } to info
    }
}
