@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ClientInfo(
  val name: String,
  val version: String,
  val workspaceRootUri: String,
  val workspaceRootPath: String? = null,
  val extensionConfiguration: ExtensionConfiguration? = null,
  val capabilities: ClientCapabilities? = null,
)

