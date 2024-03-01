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
        val error =
            CodyError(
                title = getTitle(event),
                version = getVersion(),
                logs = getLogs(event, additionalInfo))
        val url = getEncodedUrl(error)
        BrowserUtil.browse(url)
      }
    } catch (e: Exception) {
      consumer.consume(SubmittedReportInfo(SubmissionStatus.FAILED))
      return false
    }
    consumer.consume(SubmittedReportInfo(SubmissionStatus.NEW_ISSUE))
    return true
  }

  private fun getTitle(event: IdeaLoggingEvent): String {
    val title = trimPostfix(event.throwableText.lines().first(), 128)
    return "bug: $title"
  }

  private fun getVersion() =
      formatAttributes(
          "Plugin version" to pluginDescriptor?.version,
          "IDE version" to ApplicationInfo.getInstance().build.toString())

  private fun getLogs(event: IdeaLoggingEvent, additionalInfo: String?) =
      formatAttributes(
          "Stacktrace" to trimPostfix(event.throwableText, 6500), // max total length is 8192
          "Additional info" to additionalInfo)

  private fun trimPostfix(text: String, maxLength: Int): String {
    val postfix = "..."
    return if (text.length > maxLength) text.take(maxLength - postfix.length) + postfix else text
  }

  private fun formatAttributes(vararg pairs: Pair<String, String?>) =
      pairs
          .flatMap { (key, value) -> value?.let { listOf(formatAttribute(key, it)) } ?: listOf() }
          .joinToString("\n")

  private fun formatAttribute(label: String, text: String) =
      if (text.lines().size != 1) "$label:\n```text\n$text\n```" else "$label: ```$text```"

  private fun getEncodedUrl(error: CodyError): String =
      "https://github.com/sourcegraph/jetbrains/issues/new" +
          "?template=bug_report.yml" +
          "&labels=bug,team/jetbrains" +
          "&projects=sourcegraph/381" +
          "&title=${encode(error.title)}" +
          "&version=${encode(error.version)}" +
          "&logs=${encode(error.logs)}"

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")
}
