package com.sourcegraph.cody.error

import com.intellij.diagnostic.AbstractMessage
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.diagnostic.SubmittedReportInfo.SubmissionStatus
import com.intellij.util.Consumer
import java.awt.Component

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

      SentryService.report(ex, msg, null)
    } catch (e: Exception) {
      consumer.consume(SubmittedReportInfo(SubmissionStatus.FAILED))
      return false
    }

    consumer.consume(SubmittedReportInfo(SubmissionStatus.NEW_ISSUE))
    return true
  }
}
