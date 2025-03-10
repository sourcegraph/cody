package com.sourcegraph.cody.edit

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.removeUserData
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.util.preferredHeight
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.agent.protocol_generated.EditCommands_CodeParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask
import com.sourcegraph.cody.agent.protocol_generated.EditTask_RetryParams
import com.sourcegraph.cody.agent.protocol_generated.ModelAvailabilityStatus
import com.sourcegraph.cody.chat.PromptHistory
import com.sourcegraph.cody.chat.ui.LlmDropdown
import com.sourcegraph.cody.edit.EditUtil.namedButton
import com.sourcegraph.cody.edit.EditUtil.namedLabel
import com.sourcegraph.cody.edit.EditUtil.namedPanel
import com.sourcegraph.cody.edit.actions.EditCodeAction
import com.sourcegraph.cody.ui.TextAreaHistoryManager
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.ListCellRenderer
import javax.swing.event.CaretListener

/** Pop up a user interface for giving Cody instructions to fix up code at the cursor. */
class EditCommandPrompt(
    val project: Project,
    val editor: Editor,
    private val dialogTitle: String,
    private val previousEdit: EditTask? = null
) : DataProvider {

  private var popup: JBPopup? = null

  private val logger = Logger.getInstance(EditCommandPrompt::class.java)

  private val offset = editor.caretModel.primaryCaret.offset

  private var model: String? = previousEdit?.model

  private val okButton =
      namedButton("ok-button").apply {
        text = "Edit Code"
        foreground = boldLabelColor()
        addActionListener { popup?.closeOk(null) }
      }

  private val okButtonGroup =
      namedPanel("ok-button-group").apply {
        border = BorderFactory.createEmptyBorder(4, 0, 4, 4)
        isOpaque = false
        background = textFieldBackground()
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        val shortcutLabel =
            editKeyStroke()?.let { keystroke ->
              namedLabel("ok-keyboard-shortcut-label")
                  .apply {
                    text = KeymapUtil.getKeystrokeText(keystroke)
                    // Spacing between key shortcut and button.
                    border = BorderFactory.createEmptyBorder(0, 0, 0, 12)
                  }
                  .also(::add)
            }
        add(okButton)

        this.addPropertyChangeListener { evt ->
          if (evt?.propertyName == "enabled") {
            okButton.isEnabled = evt.newValue as Boolean
            shortcutLabel?.isEnabled = evt.newValue as Boolean
          }
        }
      }

  private val cancelLabel =
      namedLabel("esc-cancel-label").apply {
        text = "[esc] to cancel"
        foreground = boldLabelColor()
        cursor = Cursor(Cursor.HAND_CURSOR)
        addMouseListener( // Make it work like ESC key if you click it.
            object : MouseAdapter() {
              override fun mouseClicked(e: MouseEvent) {
                popup?.cancel(e)
              }
            })
      }

  private val instructionsField =
      InstructionsInputTextArea().apply { text = previousEdit?.instruction ?: lastPrompt }

  private val historyManager = TextAreaHistoryManager(instructionsField, promptHistory)

  private val llmDropdown =
      LlmDropdown(
              modelUsage = ModelUsage.EDIT,
              project = project,
              onSetSelectedItem = { model = it.id },
              this,
              fixedModel = model)
          .apply {
            foreground = boldLabelColor()
            background = textFieldBackground()
            border = BorderFactory.createLineBorder(mutedLabelColor(), 1, true)
            renderer =
                object : ListCellRenderer<ModelAvailabilityStatus> {
                  private val defaultRenderer = renderer

                  override fun getListCellRendererComponent(
                      list: JList<out ModelAvailabilityStatus>?,
                      value: ModelAvailabilityStatus?,
                      index: Int,
                      isSelected: Boolean,
                      cellHasFocus: Boolean
                  ): Component {
                    val renderer =
                        defaultRenderer.getListCellRendererComponent(
                            list, value, index, isSelected, cellHasFocus)
                    if (renderer is JComponent) {
                      renderer.border = BorderFactory.createLineBorder(background, 2, true)
                    }
                    return renderer
                  }
                }
          }

  private var titleLabel =
      namedLabel("title-label").apply {
        text = dialogTitle
        setBorder(BorderFactory.createEmptyBorder(10, 14, 10, 10))
        foreground = boldLabelColor()
      }

  private var filePathLabel =
      namedLabel("file-path-label").apply {
        setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10))
        foreground = mutedLabelColor()
      }

  private val promptCaretListener = CaretListener {
    updateOkButtonState()
    checkForInterruptions()
    historyLabel.isEnabled = historyManager.isHistoryAvailable()
  }

  private val historyLabel =
      namedLabel("history-label").apply {
        text = "↑↓ for history"
        horizontalAlignment = JLabel.CENTER
        isEnabled = historyManager.isHistoryAvailable() && instructionsField.text.isEmpty()
      }

  fun isOkActionEnabled() = popup?.isVisible == true && okButtonGroup.isEnabled && model != null

  init {
    ApplicationManager.getApplication().assertIsDispatchThread()

    project.putUserData(EDIT_COMMAND_PROMPT_KEY, this)

    setupTextField()
    updateOkButtonState()

    createAndShowPopup()
  }

  private fun createAndShowPopup() {
    popup =
        JBPopupFactory.getInstance()
            .createComponentPopupBuilder(createPopupContent(), instructionsField)
            .setMovable(true)
            .setResizable(true)
            .setRequestFocus(true)
            .setCancelKeyEnabled(true)
            .setMinSize(Dimension(DEFAULT_TEXT_FIELD_WIDTH, DIALOG_MINIMUM_HEIGHT))
            .createPopup()

    popup?.showInBestPositionFor(editor)

    popup?.addListener(
        object : JBPopupListener {
          override fun onClosed(event: LightweightWindowEvent) {
            try {
              if (event.isOk) {
                lastPrompt = ""
                val context = SimpleDataContext.getProjectContext(project)
                val action = ActionManager.getInstance().getAction("cody.inlineEditEditCode")
                val actionEvent = AnActionEvent.createFromAnAction(action, null, "", context)
                action.actionPerformed(actionEvent)
              } else {
                lastPrompt = instructionsField.text
              }
            } finally {
              if (popup === event.asPopup()) {
                popup = null
                project.removeUserData(EDIT_COMMAND_PROMPT_KEY)
              }
            }
          }
        })
  }

  private fun createPopupContent(): JComponent {
    return JPanel(BorderLayout()).apply {
      add(createTopRow(), BorderLayout.NORTH)
      add(createCenterPanel(), BorderLayout.CENTER)
      add(createBottomRow(), BorderLayout.SOUTH)
      isEnabled = true

      editKeyStroke()?.let {
        registerKeyboardAction(
            { popup?.closeOk(null) }, it, JComponent.WHEN_ANCESTOR_OF_FOCUSED_COMPONENT)
      }
    }
  }

  private fun editKeyStroke() =
      (KeymapUtil.getActiveKeymapShortcuts("cody.inlineEditEditCode").shortcuts.firstOrNull()
              as? KeyboardShortcut)
          ?.firstKeyStroke

  @RequiresEdt
  private fun setupTextField() {
    instructionsField.addCaretListener(promptCaretListener)
  }

  @RequiresEdt
  private fun updateOkButtonState() {
    okButtonGroup.isEnabled = instructionsField.text.isNotBlank()
  }

  @RequiresEdt
  private fun checkForInterruptions() {
    if (editor.isDisposed || editor.isViewer || !editor.document.isWritable) {
      popup?.cancel()
    }
  }

  private fun createTopRow(): JPanel {
    return namedPanel("top-row").apply {
      layout = BorderLayout()
      isFocusable = false
      add(titleLabel, BorderLayout.WEST)
      val (line, col) = editor.offsetToLogicalPosition(offset).let { Pair(it.line, it.column) }
      val virtualFile = FileDocumentManager.getInstance().getFile(editor.document)
      val file = getFormattedFilePath(virtualFile)
      filePathLabel.text = "$file at ${line + 1}:${col + 1}"
      filePathLabel.toolTipText = virtualFile?.path
      add(filePathLabel, BorderLayout.CENTER)
    }
  }

  private fun getFormattedFilePath(file: VirtualFile?): String {
    val maxLength = 70
    val fileName = file?.name ?: FILE_PATH_404
    val fullPath = file?.path ?: return fileName
    val project = editor.project ?: return FILE_PATH_404

    val projectRootPath = getProjectRootPath(project, file) ?: return fileName

    val relativePath = fullPath.removePrefix(projectRootPath)
    val truncatedPath =
        if (relativePath.length > maxLength) {
          "…${relativePath.takeLast(maxLength - 1)}"
        } else {
          relativePath
        }

    return truncatedPath.ifEmpty { fileName }
  }

  private fun getProjectRootPath(project: Project, file: VirtualFile?): String? {
    val projectRootManager = ProjectRootManager.getInstance(project)
    val contentRoots = projectRootManager.contentRoots
    val contentRoot =
        file?.let { nonNullFile ->
          contentRoots.firstOrNull { VfsUtilCore.isAncestor(it, nonNullFile, false) }
        }
    return contentRoot?.path
  }

  private fun createCenterPanel(): JPanel {
    return namedPanel("center-panel").apply {
      isOpaque = true
      background = textFieldBackground()
      layout = BorderLayout()

      add(
          JScrollPane().apply {
            verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
            horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED
            border = JBUI.Borders.empty()
            viewport.setOpaque(false)
            setViewportView(instructionsField)
            preferredHeight = 100
          },
          BorderLayout.CENTER)
      add(
          namedPanel("llmDropdown-horizontal-positioner").apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            isOpaque = false
            border = JBUI.Borders.empty()
            add(Box.createHorizontalStrut(15))
            add(
                namedPanel("llmDropdown-vertical-positioner").apply {
                  layout = BoxLayout(this, BoxLayout.Y_AXIS)
                  isOpaque = false
                  border = JBUI.Borders.empty()
                  add(llmDropdown)
                  add(Box.createVerticalStrut(10))
                })
            isOpaque = false
            add(Box.createHorizontalStrut(15))
          },
          BorderLayout.SOUTH)
    }
  }

  private fun createBottomRow(): JPanel {
    return namedPanel("bottom-row-outer").apply {
      layout = BoxLayout(this, BoxLayout.X_AXIS)
      border = BorderFactory.createEmptyBorder(0, 20, 0, 12)

      add(cancelLabel)
      add(Box.createHorizontalGlue())
      add(historyLabel)
      add(Box.createHorizontalGlue())
      add(okButtonGroup)
    }
  }

  @RequiresEdt
  fun performOKAction() {
    val text = instructionsField.text
    if (text.isBlank()) {
      popup?.cancel()
      return
    }
    historyManager.addPrompt(text)
    if (editor.project == null) {
      val msg = "Null project for new edit session"
      logger.warn(msg)
      return
    }

    val currentModel = model
    if (currentModel == null) {
      logger.warn("Model for new edit cannot be null")
      return
    }

    CodyAgentService.withAgent(project) { agent ->
      val result =
          if (previousEdit != null) {
            val params =
                EditTask_RetryParams(
                    previousEdit.id,
                    text,
                    currentModel,
                    EditTask_RetryParams.ModeEnum.Edit,
                    previousEdit.selectionRange)
            agent.server.editTask_retry(params).get()
          } else {
            agent.server
                .editCommands_code(
                    EditCommands_CodeParams(
                        instruction = text,
                        model = currentModel,
                        mode = EditCommands_CodeParams.ModeEnum.Edit))
                .get()
          }
      EditCodeAction.completedEditTasks[result.id] = result
    }
  }

  companion object {
    val EDIT_COMMAND_PROMPT_KEY: Key<EditCommandPrompt?> = Key.create("EDIT_COMMAND_PROMPT_KEY")

    // This is a fallback for the rare case when the screen size computations fail.
    const val DEFAULT_TEXT_FIELD_WIDTH: Int = 700

    const val DIALOG_MINIMUM_HEIGHT = 200

    // Used when the Editor/Document does not have an associated filename.
    private const val FILE_PATH_404 = "unknown file"

    private const val HISTORY_CAPACITY = 100
    val promptHistory = PromptHistory(HISTORY_CAPACITY)

    // The last text the user typed in without saving it, for continuity.
    var lastPrompt: String = ""

    // Caching these caused problems with theme switches, even when we
    // updated the cached values on theme-switch notifications.

    fun mutedLabelColor(): Color = EditUtil.getThemeColor("Label.disabledForeground")!!

    fun boldLabelColor(): Color = EditUtil.getThemeColor("Label.foreground")!!

    fun textFieldBackground(): Color = EditUtil.getThemeColor("TextField.background")!!

    fun isVisible(project: Project): Boolean {
      val commandPrompt = EDIT_COMMAND_PROMPT_KEY.get(project)
      return commandPrompt?.popup?.isVisible == true
    }
  }

  override fun getData(dataId: String): Any? {
    if (CommonDataKeys.PROJECT.`is`(dataId)) {
      return project
    }
    return null
  }
}
