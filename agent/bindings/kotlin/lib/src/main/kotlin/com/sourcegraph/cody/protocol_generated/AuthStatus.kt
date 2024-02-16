@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class AuthStatus(
  var username: String? = null,
  var endpoint: String? = null,
  var isDotCom: Boolean? = null,
  var isLoggedIn: Boolean? = null,
  var showInvalidAccessTokenError: Boolean? = null,
  var authenticated: Boolean? = null,
  var hasVerifiedEmail: Boolean? = null,
  var requiresVerifiedEmail: Boolean? = null,
  var siteHasCodyEnabled: Boolean? = null,
  var siteVersion: String? = null,
  var configOverwrites: CodyLLMSiteConfiguration? = null,
  var showNetworkError: Boolean? = null,
  var primaryEmail: String? = null,
  var displayName: String? = null,
  var avatarURL: String? = null,
  var userCanUpgrade: Boolean? = null,
)

