package com.sourcegraph.cody.config.migration

import com.sourcegraph.cody.auth.CodyAccount
import com.sourcegraph.cody.auth.deprecated.DeprecatedCodyAccountManager

object AccountsMigration {
  fun migrate() {
    val codyAccountManager = DeprecatedCodyAccountManager.getInstance()
    codyAccountManager.getAccounts().forEach { oldAccount ->
      val token = codyAccountManager.getTokenForAccount(oldAccount)
      if (token != null) {
        CodyAccount(oldAccount.server).storeToken(token)
      }
    }

    codyAccountManager.account?.server?.let { CodyAccount.setActiveAccount(CodyAccount(it)) }
  }
}
