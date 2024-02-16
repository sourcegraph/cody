@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class AuthStatus(
  val username: String? = null,
  val endpoint: String? = null,
  val isDotCom: Boolean? = null,
  val isLoggedIn: Boolean? = null,
  val showInvalidAccessTokenError: Boolean? = null,
  val authenticated: Boolean? = null,
  val hasVerifiedEmail: Boolean? = null,
  val requiresVerifiedEmail: Boolean? = null,
  val siteHasCodyEnabled: Boolean? = null,
  val siteVersion: String? = null,
  val configOverwrites: CodyLLMSiteConfiguration? = null,
  val showNetworkError: Boolean? = null,
  val primaryEmail: String? = null,
  val displayName: String? = null,
  val avatarURL: String? = null,
  val userCanUpgrade: Boolean? = null,
)

