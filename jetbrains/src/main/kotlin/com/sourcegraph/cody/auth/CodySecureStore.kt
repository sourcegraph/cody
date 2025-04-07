package com.sourcegraph.cody.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import javax.crypto.spec.SecretKeySpec
import org.apache.commons.lang.RandomStringUtils

@Service(Service.Level.APP)
class CodySecureStore {
  private val keyStoreFile = File(System.getProperty("user.home"), ".sourcegraph/cody.keystore")

  init {
    if (!keyStoreFile.exists()) {
      keyStoreFile.parentFile.mkdirs()
      val password = getKeyStorePassword()
      val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
      keyStore.load(null, password)
      FileOutputStream(keyStoreFile).use { fos -> keyStore.store(fos, password) }
    }
  }

  fun getFromSecureStore(key: String): String? {
    val keyStore = getKeyStore()
    if (!keyStore.containsAlias(key)) return null

    val protParam = KeyStore.PasswordProtection(getKeyStorePassword())
    val entry = keyStore.getEntry(key, protParam) as? KeyStore.SecretKeyEntry
    return entry?.secretKey?.encoded?.toString(Charsets.UTF_8)
        ?: CodyPasswordStore.getFromPasswordStore(key)
  }

  fun writeToSecureStore(key: String, value: String?) {
    val keyStore = getKeyStore()
    if (value == null) {
      keyStore.deleteEntry(key)
    } else {
      val secretKey = SecretKeySpec(value.toByteArray(Charsets.UTF_8), "AES")
      val keyEntry = KeyStore.SecretKeyEntry(secretKey)
      val protParam = KeyStore.PasswordProtection(getKeyStorePassword())
      keyStore.setEntry(key, keyEntry, protParam)
    }

    FileOutputStream(keyStoreFile).use { fos -> keyStore.store(fos, getKeyStorePassword()) }
  }

  private fun getKeyStorePassword(): CharArray {
    val passwordKey = "KeyStorePassword"
    var password = CodyPasswordStore.getFromPasswordStore(passwordKey)

    if (password == null) {
      password = RandomStringUtils.randomAlphabetic(64)
      CodyPasswordStore.writeToPasswordStore(passwordKey, password)
    }

    return password!!.toCharArray()
  }

  private fun getKeyStore(): KeyStore {
    val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
    FileInputStream(keyStoreFile).use { fis -> keyStore.load(fis, getKeyStorePassword()) }
    return keyStore
  }

  private object CodyPasswordStore {
    private fun credentialAttributes(key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName("Sourcegraph", key))

    fun getFromPasswordStore(key: String): String? {
      return PasswordSafe.instance.get(credentialAttributes(key))?.getPasswordAsString()
    }

    fun writeToPasswordStore(key: String, value: String?) {
      PasswordSafe.instance.set(credentialAttributes(key), Credentials(user = "", value))
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(): CodySecureStore {
      return ApplicationManager.getApplication().getService(CodySecureStore::class.java)
    }
  }
}
