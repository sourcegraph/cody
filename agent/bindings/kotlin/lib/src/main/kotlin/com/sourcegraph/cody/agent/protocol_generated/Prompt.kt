@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Prompt(
  val id: String,
  val name: String,
  val nameWithOwner: String,
  val owner: OwnerParams,
  val description: String? = null,
  val draft: Boolean,
  val definition: DefinitionParams,
  val url: String,
)

