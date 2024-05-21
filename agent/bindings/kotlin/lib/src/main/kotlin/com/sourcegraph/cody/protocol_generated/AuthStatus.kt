@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class AuthStatus(
  val username: String,
  val endpoint: String? = null,
  val isDotCom: Boolean,
  val isLoggedIn: Boolean,
  val showInvalidAccessTokenError: Boolean,
  val authenticated: Boolean,
  val hasVerifiedEmail: Boolean,
  val requiresVerifiedEmail: Boolean,
  val siteHasCodyEnabled: Boolean,
  val siteVersion: String,
  val codyApiVersion: Int,
  val configOverwrites: CodyLLMSiteConfiguration? = null,
  val showNetworkError: Boolean? = null,
  val primaryEmail: String,
  val displayName: String? = null,
  val avatarURL: String,
  val userCanUpgrade: Boolean,
)

