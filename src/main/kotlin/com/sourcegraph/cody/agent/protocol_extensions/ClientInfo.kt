package com.sourcegraph.cody.agent.protocol_extensions

import com.sourcegraph.cody.agent.protocol_generated.ClientCapabilities
import com.sourcegraph.cody.agent.protocol_generated.ClientInfo
import com.sourcegraph.cody.agent.protocol_generated.ExtensionConfiguration

object ClientInfoFactory {
  fun build(
      version: String,
      ideVersion: String,
      workspaceRootUri: String,
      extensionConfiguration: ExtensionConfiguration?,
      capabilities: ClientCapabilities?
  ): ClientInfo {
    return ClientInfo(
        name = "JetBrains",
        version = version,
        ideVersion = ideVersion,
        workspaceRootUri = workspaceRootUri,
        extensionConfiguration = extensionConfiguration,
        capabilities = capabilities,
    )
  }
}
