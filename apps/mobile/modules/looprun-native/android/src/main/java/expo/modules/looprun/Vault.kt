package expo.modules.looprun

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class Vault(private val context: Context) {
  private val prefs = context.getSharedPreferences("looprun-vault", Context.MODE_PRIVATE)
  fun developerMode(): Boolean = get("developer-mode") == "enabled"
  private fun profileKey(name: String): String = if (developerMode()) "developer-$name" else name
  fun profile(name: String): String = get(profileKey(name))
  fun putProfile(name: String, value: String) = put(profileKey(name), value)
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("looprun-credentials", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("looprun-credentials", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun put(name: String, value: String) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    check(prefs.edit().putString(name, encoded).commit()) { "无法保存本机凭据" }
  }
  @Synchronized fun get(name: String): String {
    val value = prefs.getString(name, null) ?: return ""
    val parts = value.split(":", limit = 2)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    }
    return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
  }
  @Synchronized fun installSecret(): String {
    profile("install-secret").takeIf { it.isNotEmpty() }?.let { return it }
    val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING).also { putProfile("install-secret", it) }
  }
}
