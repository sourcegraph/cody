package com.sourcegraph.cody.error

object CodyErrorFormatter {

  fun formatToMarkdown(error: CodyError) =
      mapOf(
              "Plugin version" to error.pluginVersion,
              "IDE version" to error.ideVersion,
              "Additional information" to error.additionalInfo,
              "Stacktrace" to error.stacktrace)
          .flatMap { (key, value) ->
            value?.let { listOf(toLabeledCodeBlock(key, it)) } ?: listOf()
          }
          .joinToString("\n")

  private fun toLabeledCodeBlock(label: String, text: String) =
      if (text.lines().size != 1) "$label:\n```text\n$text\n```" else "$label: ```$text```"
}
