/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ClientInfo(
  val name: String,
  val version: String,
  val ideVersion: String? = null,
  val workspaceRootUri: String,
  val workspaceRootPath: String? = null,
  val extensionConfiguration: ExtensionConfiguration? = null,
  val capabilities: ClientCapabilities? = null,
)

