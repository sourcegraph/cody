@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ServerInfo(
  val name: String? = null,
  val authenticated: Boolean? = null,
  val codyEnabled: Boolean? = null,
  val codyVersion: String? = null,
  val authStatus: AuthStatus? = null,
)

