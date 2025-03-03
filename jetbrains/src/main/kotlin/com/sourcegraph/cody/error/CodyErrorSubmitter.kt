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
import kotlin.math.min

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
            "&labels=bug,repo/jetbrains" +
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

  // Ideally we want to include full info and stacktrace, but if that is not possible.
  // We try to fit full additional info first, and then trim stacktrace. If at lest minimal
  // stacktrace doesn't fit, we trim additional info so minimal stacktrace will fit.
  private fun trimLogs(throwableText: String?, additionalInfo: String?, maxLength: Int): String {
    val newLine = encode("\n")
    val realMaxLength = maxLength - newLine.length

    val minimalStacktrace =
        prepareStacktrace(throwableText, contextLines = 2, maxLength = realMaxLength)
    val maximalInfo = formatAttribute("Additional info", additionalInfo)

    val adjustedInfoLength =
        max(0, min(maximalInfo.length, realMaxLength - minimalStacktrace.length))
    val adjustedInfo = maximalInfo.take(adjustedInfoLength)

    val adjustedStacktraceLength = realMaxLength - adjustedInfoLength
    val adjustedStacktrace =
        prepareStacktrace(throwableText, contextLines = 50, maxLength = adjustedStacktraceLength)

    return listOf(adjustedInfo, adjustedStacktrace).joinToString(newLine)
  }

  private fun prepareStacktrace(throwableText: String?, contextLines: Int, maxLength: Int): String {
    val stacktraceLines = throwableText?.lines()
    if (stacktraceLines.isNullOrEmpty()) return ""

    val codyLineIndex = stacktraceLines.indexOfFirst { it.contains("com.sourcegraph") }

    val content =
        if (codyLineIndex != -1) {
          val startIndex = max(0, codyLineIndex - contextLines)
          val endIndex = min(stacktraceLines.size, codyLineIndex + contextLines + 1)
          stacktraceLines.subList(startIndex, endIndex).joinToString("\n")
        } else {
          stacktraceLines.take(contextLines).joinToString("\n")
        }

    val formattedContent = formatAttribute("Stacktrace", content)
    return if (formattedContent.length > maxLength) {
      prepareStacktrace(content, contextLines - 1, maxLength)
    } else {
      formattedContent
    }
  }

  private fun trimPostfix(text: String, maxLength: Int): String {
    return if (text.length > maxLength) text.take(maxLength - DOTS.length) + DOTS else text
  }

  private fun formatAttribute(label: String, text: String?): String {
    return if (text.isNullOrBlank()) "" else encode("$label:\n```text\n$text\n```")
  }

  private fun encode(text: String) = URLEncoder.encode(text, "UTF-8")

  companion object {
    const val MAX_URL_LENGTH = 8192 - 1
  }
}
