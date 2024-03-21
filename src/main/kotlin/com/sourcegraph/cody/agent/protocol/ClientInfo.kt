package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.ExtensionConfiguration

data class ClientInfo(
    var version: String,
    var workspaceRootUri: String? = null,
    var extensionConfiguration: ExtensionConfiguration? = null,
    var capabilities: ClientCapabilities? = null,
) {
  val name = "JetBrains"
}
