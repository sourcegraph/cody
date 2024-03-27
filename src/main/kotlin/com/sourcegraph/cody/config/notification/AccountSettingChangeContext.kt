package com.sourcegraph.cody.config.notification

class AccountSettingChangeContext(
    val serverUrlChanged: Boolean = false,
    val accessTokenChanged: Boolean = false,
    val accountTierChanged: Boolean = false
) {
  fun accountChanged(): Boolean = serverUrlChanged || accessTokenChanged
}
