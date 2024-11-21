package com.sourcegraph.cody.config

import com.sourcegraph.config.ConfigUtil

data class ServerAuth(
    val instanceUrl: String,
    val accessToken: String,
    val customRequestHeaders: String
)

object ServerAuthLoader {

  @JvmStatic
  fun loadServerAuth(): ServerAuth {
    val codyAuthenticationManager = CodyAuthenticationManager.getInstance()
    val defaultAccount = codyAuthenticationManager.account
    if (defaultAccount != null) {
      val accessToken = codyAuthenticationManager.getTokenForAccount(defaultAccount) ?: ""
      return ServerAuth(
          defaultAccount.server.url, accessToken, defaultAccount.server.customRequestHeaders)
    }
    return ServerAuth(ConfigUtil.DOTCOM_URL, "", "")
  }
}
