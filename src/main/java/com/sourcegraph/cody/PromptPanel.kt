package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.agent.WebviewMessage
import com.sourcegraph.cody.agent.protocol.ContextItem
import com.sourcegraph.cody.agent.protocol.ContextItemFile
import com.sourcegraph.cody.chat.ChatSession
import com.sourcegraph.cody.chat.CodyChatMessageHistory
import com.sourcegraph.cody.chat.ui.SendButton
import com.sourcegraph.cody.ui.AutoGrowingTextArea
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.ui.SimpleDumbAwareBGTAction
import java.awt.Dimension
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.DefaultListModel
import javax.swing.JLayeredPane
import javax.swing.KeyStroke
import javax.swing.border.EmptyBorder
import javax.swing.event.AncestorEvent
import javax.swing.event.AncestorListener
import javax.swing.text.DefaultEditorKit

class PromptPanel(project: Project, private val chatSession: ChatSession) : JLayeredPane() {

  /** View components */
  private val autoGrowingTextArea = AutoGrowingTextArea(5, 9, this)
  private val scrollPane = autoGrowingTextArea.scrollPane
  private val textArea = autoGrowingTextArea.textArea
  private val sendButton = SendButton()
  private var contextFilesListViewModel = DefaultListModel<DisplayedContextFile>()
  private val contextFilesListView = JBList(contextFilesListViewModel)
  private val contextFilesContainer = JBScrollPane(contextFilesListView)
  // When "history mode" is enabled, pressing Up/Down arrow keys replaces the chat input with the
  // previous/next chat message (via CodyChatMessageHistory). History mode can only be activated
  // when
  // the chat input is empty, and it's deactivated on the first key action that is not an Up/Down
  // arrow key.
  private var isInHistoryMode = true

  /** Externally updated state */
  private val selectedContextItems: ArrayList<ContextItem> = ArrayList()

  /** Related components */
  private val promptMessageHistory =
      CodyChatMessageHistory(project, CHAT_MESSAGE_HISTORY_CAPACITY, chatSession)

  init {
    /** Initialize view */
    textArea.emptyText.text = CodyBundle.getString("PromptPanel.ask-cody.message")
    scrollPane.border = EmptyBorder(JBUI.emptyInsets())
    scrollPane.background = UIUtil.getPanelBackground()

    // Set initial bounds for the scrollPane (100x100) to ensure proper initialization;
    // later adjusted dynamically based on component resizing in the component listener.
    scrollPane.setBounds(0, 0, 100, 100)
    add(scrollPane, DEFAULT_LAYER)
    scrollPane.setBounds(0, 0, width, scrollPane.preferredSize.height)

    contextFilesListView.disableEmptyText()
    add(contextFilesContainer, PALETTE_LAYER, 0)

    add(sendButton, PALETTE_LAYER, 0)

    preferredSize = Dimension(scrollPane.width, scrollPane.height)

    /** Add listeners */
    addAncestorListener(
        object : AncestorListener {
          override fun ancestorAdded(event: AncestorEvent?) {
            textArea.requestFocusInWindow()
            textArea.caretPosition = textArea.document.length
          }

          override fun ancestorRemoved(event: AncestorEvent?) {}

          override fun ancestorMoved(event: AncestorEvent?) {}
        })
    addComponentListener(
        object : ComponentAdapter() {
          override fun componentResized(e: ComponentEvent?) {
            revalidate()
          }
        })

    // Add user action listeners
    sendButton.addActionListener { _ -> didSubmitChatMessage() }
    textArea.addCaretListener {
      refreshSendButton()
      didUserInputChange()
    }
    textArea.addKeyListener(
        object : KeyAdapter() {
          override fun keyReleased(e: KeyEvent) {
            if (e.keyCode != KeyEvent.VK_UP && e.keyCode != KeyEvent.VK_DOWN) {
              isInHistoryMode = textArea.getText().isEmpty()
            }
          }
        })

    contextFilesListView.addMouseListener(
        object : MouseAdapter() {
          override fun mouseClicked(e: MouseEvent) {
            contextFilesListView.selectedIndex = contextFilesListView.locationToIndex(e.getPoint())
            didSelectContextFile()
            textArea.requestFocusInWindow()
          }
        })
    for (shortcut in listOf(ENTER, UP, DOWN, TAB)) { // key listeners
      SimpleDumbAwareBGTAction { didUseShortcut(shortcut) }
          .registerCustomShortcutSet(shortcut, textArea)
    }

    revalidate()
  }

  fun focus() = textArea.requestFocusInWindow()

  private fun didUseShortcut(shortcut: CustomShortcutSet) {
    if (contextFilesListView.model.size > 0) {
      when (shortcut) {
        UP -> setSelectedContextFileIndex(-1)
        DOWN -> setSelectedContextFileIndex(1)
        ENTER,
        TAB -> didSelectContextFile()
      }
      return
    }
    when (shortcut) {
      ENTER -> if (sendButton.isEnabled) didSubmitChatMessage()
      UP ->
          if (isInHistoryMode) {
            promptMessageHistory.popUpperMessage(textArea)
          } else {
            val defaultAction = textArea.actionMap[DefaultEditorKit.upAction]
            defaultAction.actionPerformed(null)
          }
      DOWN ->
          if (isInHistoryMode) {
            promptMessageHistory.popLowerMessage(textArea)
          } else {
            val defaultAction = textArea.actionMap[DefaultEditorKit.downAction]
            defaultAction.actionPerformed(null)
          }
    }
  }

  /** View handlers */
  private fun didSubmitChatMessage() {
    val cf = findContextFiles(selectedContextItems, textArea.text)
    val text = textArea.text

    // Reset text
    promptMessageHistory.messageSent(text)
    textArea.text = ""
    isInHistoryMode = true
    selectedContextItems.clear()

    chatSession.sendMessage(text, cf)
  }

  private fun didSelectContextFile() {
    if (contextFilesListView.selectedIndex == -1) return

    val selected = contextFilesListView.model.getElementAt(contextFilesListView.selectedIndex)
    this.selectedContextItems.add(selected.contextItem)
    val cfDisplayPath = selected.contextItem.displayPath()
    val expr =
        findAtExpressions(textArea.text).find { it.endIndex == textArea.caretPosition } ?: return

    textArea.replaceRange("@${cfDisplayPath} ", expr.startIndex, expr.endIndex)

    setContextFilesSelector(listOf())
    revalidate()
  }

  private fun didUserInputChange() {
    val exp = findAtExpressions(textArea.text).find { it.endIndex == textArea.caretPosition }
    if (exp == null) {
      setContextFilesSelector(listOf())
      revalidate()
      return
    }
    val expTrimmed = exp.value.removePrefix("...")
    this.chatSession.sendWebviewMessage(
        WebviewMessage(command = "getUserContext", submitType = "user", query = expTrimmed))
  }

  /** State updaters */
  private fun setSelectedContextFileIndex(increment: Int) {
    var newSelectedIndex =
        (contextFilesListView.selectedIndex + increment) % contextFilesListView.model.size
    if (newSelectedIndex < 0) {
      newSelectedIndex += contextFilesListView.model.size
    }
    contextFilesListView.selectedIndex = newSelectedIndex
    revalidate()
  }

  override fun revalidate() {
    super.revalidate()

    // get the height of the context files list based on font height and number of context files
    val contextFilesContainerHeight =
        if (contextFilesListViewModel.isEmpty) 0 else contextFilesListView.preferredSize.height + 2
    if (contextFilesContainerHeight == 0) {
      contextFilesContainer.isVisible = false
    } else {
      contextFilesContainer.size = Dimension(scrollPane.width, contextFilesContainerHeight)
      contextFilesContainer.isVisible = true
    }

    preferredSize = Dimension(scrollPane.width, scrollPane.height + contextFilesContainerHeight)

    sendButton.setBounds(
        preferredSize.width - sendButton.preferredSize.width,
        preferredSize.height - sendButton.preferredSize.height,
        sendButton.preferredSize.width,
        sendButton.preferredSize.height)

    scrollPane.setBounds(0, contextFilesContainerHeight, width, scrollPane.preferredSize.height)
  }

  @RequiresEdt
  private fun refreshSendButton() {
    sendButton.isEnabled =
        textArea.getText().isNotEmpty() && chatSession.getCancellationToken().isDone
  }

  /** External prop setters */
  fun registerCancellationToken(cancellationToken: CancellationToken) {
    cancellationToken.onFinished {
      ApplicationManager.getApplication().invokeLater { refreshSendButton() }
    }
  }

  @RequiresEdt
  fun setContextFilesSelector(newUserContextItems: List<ContextItem>) {
    val changed = contextFilesListViewModel.elements().toList() != newUserContextItems
    if (changed) {
      val newModel = DefaultListModel<DisplayedContextFile>()
      newModel.addAll(newUserContextItems.map { f -> DisplayedContextFile(f) })
      contextFilesListView.model = newModel
      contextFilesListViewModel = newModel

      if (newUserContextItems.isNotEmpty()) {
        contextFilesListView.selectedIndex = 0
      } else {
        contextFilesListView.selectedIndex = -1
      }
      revalidate()
    }
  }

  fun updateEmptyTextAfterFirstMessage() {
    textArea.emptyText.text = CodyBundle.getString("PromptPanel.ask-cody.follow-up-message")
  }

  companion object {
    private const val CHAT_MESSAGE_HISTORY_CAPACITY = 100
    private val KEY_ENTER = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), null)
    private val KEY_UP = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_UP, 0), null)
    private val KEY_DOWN = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_DOWN, 0), null)
    private val KEY_TAB = KeyboardShortcut(KeyStroke.getKeyStroke(KeyEvent.VK_TAB, 0), null)

    val ENTER = CustomShortcutSet(KEY_ENTER)
    val UP = CustomShortcutSet(KEY_UP)
    val DOWN = CustomShortcutSet(KEY_DOWN)
    val TAB = CustomShortcutSet(KEY_TAB)

    private val atExpressionPattern = """(@(?:\\\s|\S)*)(?:\s|$)""".toRegex()

    fun findAtExpressions(text: String): List<AtExpression> {
      val matches = atExpressionPattern.findAll(text)
      val expressions = ArrayList<AtExpression>()
      for (match in matches) {
        val mainMatch = match.groups[0] ?: continue
        val prevIndex = mainMatch.range.first - 1
        // filter out things like email addresses
        if (prevIndex >= 0 && !text[prevIndex].isWhitespace()) continue

        val subMatch = match.groups[1]
        if (subMatch != null) {
          val value = subMatch.value.substring(1).replace("\\ ", " ")
          expressions.add(
              AtExpression(subMatch.range.first, subMatch.range.last + 1, subMatch.value, value))
        }
      }
      return expressions
    }

    private fun findContextFiles(contextItems: List<ContextItem>, text: String): List<ContextItem> {
      val atExpressions = findAtExpressions(text)
      return contextItems.filter { f -> atExpressions.any { it.value == f.displayPath() } }
    }
  }
}

data class DisplayedContextFile(val contextItem: ContextItem) {
  override fun toString(): String {
    val contextItemFile = contextItem as? ContextItemFile
    val isIgnored = contextItemFile?.isIgnored == true
    val isTooLarge = contextItemFile?.title == "large-file" || contextItemFile?.isTooLarge == true
    val warnIfNeeded =
        when {
          isIgnored -> "<i> - ⚠ Ignored by an admin setting</i>"
          isTooLarge -> "<i> - ⚠ File too large</i>"
          else -> ""
        }
    return "<html>${contextItem.displayPath()}$warnIfNeeded</html>"
  }
}

data class AtExpression(
    val startIndex: Int,
    val endIndex: Int,
    val rawValue: String,
    val value: String
)
