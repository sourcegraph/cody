package com.sourcegraph.cody.config.migration

import com.sourcegraph.cody.auth.CodySecureStore
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccountManager

object AccountsMigration {
  fun migrate() {
    val codyAccountManager = DeprecatedCodyAccountManager.getInstance()
    codyAccountManager.getAccounts().forEach { oldAccount ->
      val token = codyAccountManager.getTokenForAccount(oldAccount)
      if (token != null) {
        CodySecureStore.writeToSecureStore(oldAccount.server.url, token)
      }
    }
  }
}
