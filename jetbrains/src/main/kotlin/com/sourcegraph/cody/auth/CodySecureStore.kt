package com.sourcegraph.cody.auth

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

object CodySecureStore {
  private fun credentialAttributes(key: String): CredentialAttributes =
      CredentialAttributes(generateServiceName("Sourcegraph", key))

  fun getFromSecureStore(key: String): String? {
    return PasswordSafe.instance.get(credentialAttributes(key))?.getPasswordAsString()
  }

  fun writeToSecureStore(key: String, value: String?) {
    PasswordSafe.instance.set(credentialAttributes(key), Credentials(user = "", value))
  }
}
