package com.sourcegraph.cody.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.sourcegraph.config.ConfigUtil

data class CodyAccount(val server: SourcegraphServerPath) {

  fun isDotcomAccount(): Boolean = server.url.lowercase().startsWith(ConfigUtil.DOTCOM_URL)

  fun getToken(): String? {
    return PasswordSafe.instance.get(credentialAttributes(server.url))?.getPasswordAsString()
  }

  fun storeToken(token: String?) {
    PasswordSafe.instance.set(credentialAttributes(server.url), Credentials(user = "", token))
  }

  companion object {
    private const val ACTIVE_ACCOUNT_MARKER = "active_cody_account"

    @Volatile private var isActivated: Boolean = false

    private fun credentialAttributes(key: String): CredentialAttributes =
        CredentialAttributes(generateServiceName("Sourcegraph", key))

    fun hasActiveAccount(): Boolean {
      return isActivated && getActiveAccount() != null
    }

    fun setActivated(isActivated: Boolean) {
      this.isActivated = isActivated
    }

    fun getActiveAccount(): CodyAccount? {
      val serverUrl =
          PasswordSafe.instance
              .get(credentialAttributes(ACTIVE_ACCOUNT_MARKER))
              ?.getPasswordAsString()
      return if (serverUrl == null) null else CodyAccount(SourcegraphServerPath(serverUrl))
    }

    fun setActiveAccount(account: CodyAccount?) {
      PasswordSafe.instance.set(
          credentialAttributes(ACTIVE_ACCOUNT_MARKER), Credentials(user = "", account?.server?.url))
    }
  }
}
