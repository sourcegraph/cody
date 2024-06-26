package com.sourcegraph.cody.config.notification

class AccountSettingChangeContext(
    val serverUrlChanged: Boolean = false,
    val accessTokenChanged: Boolean = false,
    // We are currently not using `accountTierChanged` explicitly anywhere, but we include it to
    // make clear that `AccountSettingChangeContext` is not only about server url and token changes.
    // There are code paths which needs to be executed even if account is not switched and only tier
    // changes.
    val accountTierChanged: Boolean = false,
    val isTokenInvalidChanged: Boolean = false
) {
  fun accountSwitched(): Boolean = serverUrlChanged || accessTokenChanged

  companion object {
    const val UNAUTHORIZED_ERROR_MESSAGE = "Request response: 401 Unauthorized"
  }
}
