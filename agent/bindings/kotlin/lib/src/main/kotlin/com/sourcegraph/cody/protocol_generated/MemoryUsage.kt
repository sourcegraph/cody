@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class MemoryUsage(
  val rss: Int,
  val heapTotal: Int,
  val heapUsed: Int,
  val external: Int,
  val arrayBuffers: Int,
)

