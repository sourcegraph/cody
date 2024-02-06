package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.ExtensionConfiguration

data class ClientInfo(
    var version: String,
    var workspaceRootUri: String,
    var extensionConfiguration: ExtensionConfiguration? = null
) {
  val name = "JetBrains"
}
