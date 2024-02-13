package com.sourcegraph.cody.error

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.diagnostic.SubmittedReportInfo.SubmissionStatus
import com.intellij.util.Consumer
import java.awt.Component
import java.net.URLEncoder

class CodyErrorSubmitter : ErrorReportSubmitter() {

  override fun getReportActionText() = "Open GitHub Issue"

  override fun submit(
      events: Array<out IdeaLoggingEvent>,
      additionalInfo: String?,
      parentComponent: Component,
      consumer: Consumer<in SubmittedReportInfo>
  ): Boolean {
    try {
      if (events.isNotEmpty()) {
        val event = events.first()
        val error = getErrorDetails(event, additionalInfo)
        val markdownText = CodyErrorFormatter.formatToMarkdown(error)
        val url = encodeIssue(error.title, markdownText)
        BrowserUtil.browse(url)
      }
    } catch (e: Exception) {
      consumer.consume(SubmittedReportInfo(SubmissionStatus.FAILED))
      return false
    }
    consumer.consume(SubmittedReportInfo(SubmissionStatus.NEW_ISSUE))
    return true
  }

  private fun getErrorDetails(event: IdeaLoggingEvent, additionalInfo: String?) =
      CodyError(
          title = trimPostfix("bug: " + event.throwableText.lines().first(), 128),
          pluginVersion = pluginDescriptor?.version,
          ideVersion = ApplicationInfo.getInstance().build.toString(),
          additionalInfo = additionalInfo,
          stacktrace = trimPostfix(event.throwableText, 6500)) // max length for gh links is 8192

  private fun encodeIssue(title: String, body: String): String =
      "https://github.com/sourcegraph/jetbrains/issues/new" +
          "?labels=bug" +
          "&title=${encode(title)}" +
          "&body=${encode(body)}"

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")

  private fun trimPostfix(text: String, maxLength: Int): String {
    val postfix = " (...)"
    return if (text.length > maxLength) text.take(maxLength - postfix.length) + postfix else text
  }
}
