package com.sourcegraph.cody.error

import com.intellij.ide.BrowserUtil
import com.intellij.ide.actions.AboutDialog
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.diagnostic.SubmittedReportInfo.SubmissionStatus
import com.intellij.openapi.project.Project
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
        val url =
            getEncodedUrl(
                project = null,
                throwableText = event.throwableText,
                additionalInfo = additionalInfo)
        BrowserUtil.browse(url)
      }
    } catch (e: Exception) {
      consumer.consume(SubmittedReportInfo(SubmissionStatus.FAILED))
      return false
    }
    consumer.consume(SubmittedReportInfo(SubmissionStatus.NEW_ISSUE))
    return true
  }

  fun getEncodedUrl(
      project: Project?,
      throwableText: String? = null,
      additionalInfo: String? = null
  ): String {
    return "https://github.com/sourcegraph/jetbrains/issues/new" +
        "?template=bug_report.yml" +
        "&labels=bug" +
        "&projects=sourcegraph/381" +
        (throwableText?.let { "&title=${encode(getTitle(throwableText))}" } ?: "") +
        "&about=${encode(getAboutText(project))}" +
        "&logs=${encode(formatLogs(throwableText, additionalInfo))}"
  }

  private fun getTitle(throwableText: String): String {
    val title = trimPostfix(throwableText.lines().first(), 128)
    return "bug: $title"
  }

  private fun getAboutText(project: Project?) = AboutDialog(project).extendedAboutText

  private fun formatLogs(throwableText: String?, additionalInfo: String?) =
      formatAttributes(
          "Stacktrace" to
              throwableText?.let { trimPostfix(throwableText, 6500) }, // max total length is 8192
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

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")
}
