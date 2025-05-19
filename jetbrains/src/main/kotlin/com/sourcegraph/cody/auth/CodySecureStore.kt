package com.sourcegraph.cody.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.OneTimeString
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.Service
import com.intellij.openapi.options.ShowSettingsUtil
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups
import com.sourcegraph.config.ConfigUtil
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.KeyStore
import java.util.UUID
import javax.crypto.spec.SecretKeySpec
import org.apache.commons.lang.RandomStringUtils
import org.jetbrains.annotations.TestOnly

@Service(Service.Level.APP)
class CodySecureStore {
  // The version of the storage format, increment in case of breaking changes in the implementation
  private val storageVersion = 2
  private val passwordKey = "KeyStorePassword.v$storageVersion"

  private val keyStoreFile =
      if (ConfigUtil.isIntegrationTestModeEnabled() || PasswordSafe.instance.isMemoryOnly) {
        val tempDir = System.getProperty("java.io.tmpdir")
        val file = File(tempDir, "cody-${UUID.randomUUID()}.keystore")
        file.deleteOnExit()
        file
      } else {
        File(System.getProperty("user.home"))
            .resolve(".sourcegraph")
            .resolve("cody.v$storageVersion.keystore")
      }

  init {
    if (PasswordSafe.instance.isMemoryOnly) {
      showInMemoryOnlyPasswordWarning()
    }
  }

  @TestOnly fun getKeyStoreFile() = keyStoreFile

  fun getFromSecureStore(key: String): String? {
    synchronized(this) {
      val keyStore = getKeyStore()
      if (!keyStore.containsAlias(key)) return null

      val protParam = KeyStore.PasswordProtection(getKeystorePassword().toCharArray())
      val entry = keyStore.getEntry(key, protParam) as? KeyStore.SecretKeyEntry
      return entry?.secretKey?.encoded?.toString(Charsets.UTF_8)
    }
  }

  fun writeToSecureStore(key: String, value: String?) {
    synchronized(this) {
      val keyStore = getKeyStore()
      val password = getKeystorePassword().toCharArray()
      if (value == null) {
        keyStore.deleteEntry(key)
      } else {
        val secretKey = SecretKeySpec(value.toByteArray(Charsets.UTF_8), "AES")
        val keyEntry = KeyStore.SecretKeyEntry(secretKey)
        val protParam = KeyStore.PasswordProtection(password)
        keyStore.setEntry(key, keyEntry, protParam)
      }

      FileOutputStream(keyStoreFile).use { fos -> keyStore.store(fos, password) }
    }
  }

  private fun getKeystorePassword(): OneTimeString {
    var password = CodyPasswordStore.getFromPasswordStore(passwordKey)
    if (password == null) {
      password = OneTimeString(RandomStringUtils.randomAlphanumeric(64))
      CodyPasswordStore.writeToPasswordStore(passwordKey, password)
    }
    return password
  }

  private fun showInMemoryOnlyPasswordWarning() {
    runInEdt {
      val notification =
          Notification(
              NotificationGroups.CODY_AUTH,
              CodyBundle.getString("notification.auth.inMemoryOnly.title"),
              CodyBundle.getString("notification.auth.inMemoryOnly.detail"),
              NotificationType.WARNING)

      notification.addAction(
          NotificationAction.createSimple("Configure password storage") {
            notification.expire()
            ShowSettingsUtil.getInstance().showSettingsDialog(null, "Passwords")
          })

      Notifications.Bus.notify(notification)
    }
  }

  private fun reinitialize() {
    if (keyStoreFile.exists()) {
      val backupFile = File(keyStoreFile.absolutePath + ".bak")
      if (backupFile.exists()) backupFile.delete()
      keyStoreFile.renameTo(backupFile)

      val notification =
          Notification(
              NotificationGroups.CODY_AUTH,
              CodyBundle.getString("notification.auth.reinitialize.title"),
              CodyBundle.getString("notification.auth.reinitialize.detail"),
              NotificationType.ERROR)

      Notifications.Bus.notify(notification)
    }

    if (!keyStoreFile.exists()) {
      keyStoreFile.parentFile.mkdirs()
      val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
      val password = getKeystorePassword().toCharArray()
      keyStore.load(null, password)
      FileOutputStream(keyStoreFile).use { fos -> keyStore.store(fos, password) }
    }
  }

  private fun getKeyStore(reinitializeOnError: Boolean = true): KeyStore {
    try {
      val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
      FileInputStream(keyStoreFile).use { fis ->
        keyStore.load(fis, getKeystorePassword().toCharArray(clear = true))
      }
      return keyStore
    } catch (e: Exception) {
      if (reinitializeOnError) {
        reinitialize()
        return getKeyStore(reinitializeOnError = false)
      }
      throw e
    }
  }

  private object CodyPasswordStore {
    private fun credentialAttributes(key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName("Sourcegraph", key))

    fun getFromPasswordStore(key: String): OneTimeString? {
      return PasswordSafe.instance.get(credentialAttributes(key))?.password
    }

    fun writeToPasswordStore(key: String, password: OneTimeString?) {
      PasswordSafe.instance.set(credentialAttributes(key), Credentials(user = "", password))
    }
  }

  companion object {
    @JvmStatic
    fun getInstance(): CodySecureStore {
      return ApplicationManager.getApplication().getService(CodySecureStore::class.java)
    }
  }
}
