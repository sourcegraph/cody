@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ClientInfo(
  var name: String? = null,
  var version: String? = null,
  var workspaceRootUri: String? = null,
  var workspaceRootPath: String? = null,
  var extensionConfiguration: ExtensionConfiguration? = null,
  var capabilities: ClientCapabilities? = null,
)

