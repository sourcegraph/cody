/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Event(
  val event: String,
  val userCookieID: String,
  val url: String,
  val source: String,
  val argument: String? = null,
  val publicArgument: String? = null,
  val client: String,
  val connectedSiteID: String? = null,
  val hashedLicenseKey: String? = null,
)

