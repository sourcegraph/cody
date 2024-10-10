package com.sourcegraph.cody.error

import com.intellij.ide.BrowserUtil
import com.intellij.ide.actions.AboutDialog
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.ErrorReportSubmitter
import com.intellij.openapi.diagnostic.IdeaLoggingEvent
import com.intellij.openapi.diagnostic.SubmittedReportInfo
import com.intellij.openapi.diagnostic.SubmittedReportInfo.SubmissionStatus
import com.intellij.openapi.project.Project
import com.intellij.util.Consumer
import java.awt.Component
import java.net.URLEncoder
import java.util.concurrent.CompletableFuture
import kotlin.math.max

class CodyErrorSubmitter : ErrorReportSubmitter() {
  private val DOTS = "..."

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
    val baseUrl =
        "https://github.com/sourcegraph/jetbrains/issues/new" +
            "?template=bug_report.yml" +
            "&labels=bug" +
            "&projects=sourcegraph/381"

    val title = throwableText?.let { "&title=${encode(getTitle(it))}" } ?: ""
    val about = "&about=${encode(getAboutText(project).get())}"

    val availableSpace =
        MAX_URL_LENGTH - baseUrl.length - title.length - about.length - "&logs=".length

    val trimmedLogs = trimLogs(throwableText, additionalInfo, max(0, availableSpace))

    return "$baseUrl$title$about&logs=$trimmedLogs"
  }

  private fun getTitle(throwableText: String): String {
    val title = trimPostfix(throwableText.lines().first(), 128)
    return "bug: $title"
  }

  private fun getAboutText(project: Project?): CompletableFuture<String> {
    val result = CompletableFuture<String>()
    runInEdt { result.complete(AboutDialog(project).extendedAboutText) }
    return result
  }

  private fun trimLogs(throwableText: String?, additionalInfo: String?, maxLength: Int): String {
    val formattedLogs = encode(formatLogs(throwableText, additionalInfo))
    return if (formattedLogs.length > maxLength) {
      formattedLogs.take(maxLength - DOTS.length) + DOTS
    } else {
      formattedLogs
    }
  }

  private fun formatLogs(throwableText: String?, additionalInfo: String?) =
      formatAttributes("Stacktrace" to throwableText, "Additional info" to additionalInfo)

  private fun trimPostfix(text: String, maxLength: Int): String {
    return if (text.length > maxLength) text.take(maxLength - DOTS.length) + DOTS else text
  }

  private fun formatAttributes(vararg pairs: Pair<String, String?>) =
      pairs
          .flatMap { (key, value) -> value?.let { listOf(formatAttribute(key, it)) } ?: listOf() }
          .joinToString("\n")

  private fun formatAttribute(label: String, text: String) =
      if (text.lines().size != 1) "$label:\n```text\n$text\n```" else "$label: ```$text```"

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")

  companion object {
    const val MAX_URL_LENGTH = 8192 - 1
  }
}
