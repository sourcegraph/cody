@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class CodyTaskState(
  val idle: Int,
  val working: Int,
  val inserting: Int,
  val applying: Int,
  val formatting: Int,
  val applied: Int,
  val finished: Int,
  val error: Int,
  val pending: Int,
)

