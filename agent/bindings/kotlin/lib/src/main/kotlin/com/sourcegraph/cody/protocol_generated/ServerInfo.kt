@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ServerInfo(
  var name: String? = null,
  var authenticated: Boolean? = null,
  var codyEnabled: Boolean? = null,
  var codyVersion: String? = null,
  var authStatus: AuthStatus? = null,
)

