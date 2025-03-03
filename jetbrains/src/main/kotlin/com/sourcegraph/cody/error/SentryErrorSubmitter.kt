package com.sourcegraph.cody.error

import com.intellij.diagnostic.AbstractMessage
import com.intellij.ide.actions.AboutDialog
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.diagnostic.SubmittedReportInfo.SubmissionStatus
import com.intellij.util.Consumer
import java.awt.Component
import java.util.concurrent.CompletableFuture

class SentryErrorSubmitter : ErrorReportSubmitter() {

  override fun getReportActionText() = "Report to Sourcegraph"

  override fun submit(
      events: Array<out IdeaLoggingEvent>,
      additionalInfo: String?,
      parentComponent: Component,
      consumer: Consumer<in SubmittedReportInfo>
  ): Boolean {
    try {
      val event = events.firstOrNull()
      val ex = (event?.data as? AbstractMessage)?.throwable
      val msg =
          if (ex != null) additionalInfo
          else "$additionalInfo\n\n${event?.throwableText ?: "<No stacktrace>"}"

      SentryService.report(ex, msg, parseIdeInformation(getAboutText()))
    } catch (e: Exception) {
      consumer.consume(SubmittedReportInfo(SubmissionStatus.FAILED))
      return false
    }

    consumer.consume(SubmittedReportInfo(SubmissionStatus.NEW_ISSUE))
    return true
  }

  private fun getAboutText(): String {
    val result = CompletableFuture<String>()
    runInEdt { result.complete(AboutDialog(null).extendedAboutText) }
    return result.get()
  }

  private fun parseIdeInformation(ideInformation: String): Map<String, Any> {
    val result = mutableMapOf<String, Any>()
    var currentKey: String? = null
    val multiLineValues = mutableListOf<String>()

    try {
      for (line in ideInformation.lines()) {
        if (currentKey == null && (line.isBlank() || !line.contains(":"))) {
          continue // Skip lines without a colon
        }

        if (line.endsWith(":")) {
          // Start of a multi-line value
          if (currentKey != null && multiLineValues.isNotEmpty()) {
            // Save the previous multi-line value
            result[currentKey] = multiLineValues.toTypedArray()
            multiLineValues.clear()
          }
          currentKey = line.removeSuffix(":")
        } else if (currentKey != null && line.startsWith("  ")) {
          // Line is part of a multi-line value
          multiLineValues.add(line.trimStart())
        } else {
          // Simple key-value pair
          val parts = line.split(": ", limit = 2)
          if (parts.size == 2) {
            val key = parts[0]
            val value = parts[1]
            result[key] = value
          }
        }
      }

      // Add any remaining multi-line value
      if (currentKey != null && multiLineValues.isNotEmpty()) {
        result[currentKey] = multiLineValues.toTypedArray()
      }
    } catch (e: Exception) {
      return result
    }

    return result
  }
}
