package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.ColorUtil
import com.intellij.util.ui.SwingHelper
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.attribution.AttributionListener
import com.sourcegraph.cody.attribution.AttributionSearchCommand
import com.sourcegraph.cody.chat.*
import com.sourcegraph.cody.ui.HtmlViewer.createHtmlViewer
import com.sourcegraph.telemetry.GraphQlLogger
import java.awt.Color
import javax.swing.JEditorPane
import javax.swing.JPanel
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.Node
import org.commonmark.parser.Parser
import org.commonmark.renderer.html.HtmlRenderer

class SingleMessagePanel(
    private val chatMessage: ChatMessage,
    private val project: Project,
    private val parentPanel: JPanel,
    private val gradientWidth: Int,
    private val chatSession: ChatSession,
) : PanelWithGradientBorder(gradientWidth, chatMessage.speaker) {
  private var lastMessagePart: MessagePart? = null
  private var lastTrimmedText = ""

  init {
    val markdownNodes: Node = markdownParser.parse(chatMessage.actualMessage())
    markdownNodes.accept(MessageContentCreatorFromMarkdownNodes(this, htmlRenderer))
  }

  fun updateContentWith(text: String) {
    val trimmedText = text.trimEnd { c -> c == '`' || c.isWhitespace() }
    val isGrowing =
        trimmedText.contains(lastTrimmedText) && trimmedText.length > lastTrimmedText.length
    if (isGrowing) {
      lastTrimmedText = trimmedText
      val markdownNodes = markdownParser.parse(text)
      val lastMarkdownNode = markdownNodes.lastChild
      if (lastMarkdownNode != null && lastMarkdownNode.isCodeBlock()) {
        val (code, language) = lastMarkdownNode.extractCodeAndLanguage()
        addOrUpdateCode(code, language)
      } else {
        val nodesAfterLastCodeBlock = markdownNodes.findNodeAfterLastCodeBlock()
        val renderedHtml = htmlRenderer.render(nodesAfterLastCodeBlock)
        addOrUpdateText(renderedHtml)
      }
    }
  }

  fun addOrUpdateCode(code: String, language: String?) {
    val lastPart = lastMessagePart
    if (lastPart is CodeEditorPart) {
      lastPart.updateCode(project, code, language)
    } else {
      // For completeness of [onPartFinished] semantics.
      // At this point the implementation only considers
      // lastMessagePart if it is CodeEditorPart, so this
      // is always no-op.
      onPartFinished()
      addAsNewCodeComponent(code, language)
    }
  }

  private fun addAsNewCodeComponent(code: String, info: String?) {
    val codeEditorComponent =
        CodeEditorFactory(project, parentPanel, gradientWidth).createCodeEditor(code, info)
    this.lastMessagePart = codeEditorComponent
    add(codeEditorComponent.component)
  }

  fun addOrUpdateText(text: String) {
    val lastPart = lastMessagePart
    if (lastPart is TextPart) {
      lastPart.updateText(text)
    } else {
      onPartFinished()
      addAsNewTextComponent(text)
    }
  }

  private fun addAsNewTextComponent(renderedHtml: String) {
    val textPane: JEditorPane = createHtmlViewer(getInlineCodeBackgroundColor(chatMessage.speaker))
    SwingHelper.setHtml(textPane, renderedHtml, null)
    val textEditorComponent = TextPart(textPane)
    this.lastMessagePart = textEditorComponent
    add(textEditorComponent.component)
  }

  private fun getInlineCodeBackgroundColor(speaker: Speaker): Color {
    return if (speaker == Speaker.ASSISTANT) ColorUtil.darker(UIUtil.getPanelBackground(), 3)
    else ColorUtil.brighter(UIUtil.getPanelBackground(), 3)
  }

  /**
   * Trigger attribution search if the part that finished is a code snippet.
   *
   * Call sites should include:
   * - including new text component after writing a code snippet (triggers attribution search
   *   mid-chat message).
   * - including new code component after writing a text snippet (no-op because the implementation
   *   only considers [CodeEditorPart] [lastMessagePart], but added for completeness of
   *   [onPartFinished] semantics.
   * - in a cancellation token callback in [MessagesPanel] (triggering attribution search if code
   *   snippet is the final part as well as if Cody's typing is cancelled.
   */
  fun onPartFinished() {
    val lastPart = lastMessagePart
    if (lastPart is CodeEditorPart) {
      chatSession.getSessionId()?.let { sessionId ->
        val listener = AttributionListener.UiThreadDecorator(lastPart.attribution)
        AttributionSearchCommand(project).onSnippetFinished(lastPart.text, sessionId, listener)
      }

      ApplicationManager.getApplication().executeOnPooledThread {
        GraphQlLogger.logCodeGenerationEvent(project, "chatResponse", "hasCode", lastPart.text)
      }
    }
  }

  companion object {
    private val extensions = listOf(TablesExtension.create())

    private val markdownParser = Parser.builder().extensions(extensions).build()
    private val htmlRenderer =
        HtmlRenderer.builder().softbreak("<br />").extensions(extensions).build()
  }
}
