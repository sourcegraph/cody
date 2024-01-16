package com.sourcegraph.cody.error

import com.intellij.ide.BrowserUtil
import com.intellij.ide.plugins.IdeaPluginDescriptor
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
        val issueTitle = "bug: ${error.title}"
        val formattedError = CodyErrorFormatter.formatToMarkdown(error)
        val url = encodeIssue(issueTitle, formattedError)
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
          title = event.throwableText.lines().first(),
          pluginVersion = (pluginDescriptor as? IdeaPluginDescriptor)?.version,
          ideVersion = ApplicationInfo.getInstance().build.toString(),
          additionalInfo = additionalInfo,
          stacktrace = event.throwableText)

  private fun encodeIssue(title: String, body: String): String =
      "https://github.com/sourcegraph/jetbrains/issues/new" +
          "?labels=bug" +
          "&title=${encode(title)}" +
          "&body=${encode(body)}"

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")
}
