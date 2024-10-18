@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ServerInfo(
  val name: String,
  val authenticated: Boolean? = null,
  val authStatus: ProtocolAuthStatus? = null,
)

