@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AuthStatus(
  val endpoint: String,
  val authenticated: Boolean,
  val showNetworkError: Boolean? = null,
  val showInvalidAccessTokenError: Boolean? = null,
  val username: String,
  val isFireworksTracingEnabled: Boolean? = null,
  val hasVerifiedEmail: Boolean? = null,
  val requiresVerifiedEmail: Boolean? = null,
  val siteVersion: String,
  val codyApiVersion: Long,
  val configOverwrites: CodyLLMSiteConfiguration? = null,
  val primaryEmail: String? = null,
  val displayName: String? = null,
  val avatarURL: String? = null,
  val userCanUpgrade: Boolean? = null,
)

