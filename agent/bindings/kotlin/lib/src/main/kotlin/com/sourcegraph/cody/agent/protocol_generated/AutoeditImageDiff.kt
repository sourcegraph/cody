@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AutoeditImageDiff(
  val dark: String,
  val light: String,
  val pixelRatio: Long,
  val position: PositionParams,
)

