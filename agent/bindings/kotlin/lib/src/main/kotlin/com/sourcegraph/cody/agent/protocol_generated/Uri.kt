@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Uri(
  val scheme: String,
  val authority: String,
  val path: String,
  val query: String,
  val fragment: String,
  val fsPath: String,
)

