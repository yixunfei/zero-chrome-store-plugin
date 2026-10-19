package dev.zerovault.zero_vault_probe

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.hardware.biometrics.BiometricPrompt
import android.hardware.biometrics.BiometricManager
import android.os.CancellationSignal
import android.view.WindowManager

class MainActivity : FlutterActivity() {
    private val probe by lazy { KeystoreProbe(this) }
    private var pending: MethodChannel.Result? = null
    private var cancellation: CancellationSignal? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "dev.zerovault/p1")
            .setMethodCallHandler { call, result ->
                if (pending != null) result.error("BUSY", "A native probe is pending", null)
                else try {
                    when (call.method) {
                        "inspect" -> result.success(probe.inspect())
                        "sign" -> authenticate(result, true)
                        "windowAgreement" -> authenticate(result, false)
                        else -> result.notImplemented()
                    }
                } catch (e: Exception) { result.error("PROBE_FAILED", e.javaClass.simpleName, null) }
            }
    }

    private fun authenticate(result: MethodChannel.Result, signing: Boolean) {
        val prepared = if (signing) probe.prepareSignature() else null
        val prompt = BiometricPrompt.Builder(this)
            .setTitle(if (signing) "P1：认证绑定签名" else "P1：30 秒 ECDH 认证窗口")
            .setSubtitle("仅测试合成挑战；不是密码授权")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButton("取消", mainExecutor) { _, _ -> finishError("CANCELLED") }.build()
        pending = result
        val signal = CancellationSignal().also { cancellation = it }
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationError(code: Int, message: CharSequence) { finishError("AUTH_ERROR_$code") }
            override fun onAuthenticationSucceeded(auth: BiometricPrompt.AuthenticationResult) {
                val target = pending ?: return
                pending = null; cancellation = null
                try {
                    if (signing) {
                        val signature = checkNotNull(auth.cryptoObject?.signature)
                        signature.update("ZV/P1/synthetic-challenge".toByteArray(Charsets.UTF_8))
                        val value = signature.sign()
                        target.success(prepared!!.second + mapOf("signatureBytes" to value.size, "keyOperationSucceeded" to true))
                    } else target.success(probe.authenticatedWindowAgreement())
                } catch (e: Exception) { target.error("KEY_OPERATION_FAILED", e.javaClass.simpleName, null) }
            }
        }
        if (prepared != null) prompt.authenticate(BiometricPrompt.CryptoObject(prepared.first), signal, mainExecutor, callback)
        else prompt.authenticate(signal, mainExecutor, callback)
    }

    private fun finishError(code: String) {
        val target = pending
        pending = null; cancellation = null
        target?.error(code, "No approval produced", null)
    }

    override fun onStop() {
        cancellation?.cancel(); finishError("ACTIVITY_STOPPED"); super.onStop()
    }
}
