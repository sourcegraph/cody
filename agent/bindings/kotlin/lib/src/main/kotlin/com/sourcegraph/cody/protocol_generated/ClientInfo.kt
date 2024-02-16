@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ClientInfo(
  val name: String? = null,
  val version: String? = null,
  val workspaceRootUri: String? = null,
  val workspaceRootPath: String? = null,
  val extensionConfiguration: ExtensionConfiguration? = null,
  val capabilities: ClientCapabilities? = null,
)

