@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ClientInfo(
  val name: String,
  val version: String,
  val ideVersion: String? = null,
  val workspaceRootUri: String,
  val globalStateDir: String? = null,
  val workspaceRootPath: String? = null,
  val extensionConfiguration: ExtensionConfiguration? = null,
  val capabilities: ClientCapabilities? = null,
  val legacyNameForServerIdentification: String? = null,
)

