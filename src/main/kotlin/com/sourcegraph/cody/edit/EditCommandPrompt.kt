package com.sourcegraph.cody.edit

import com.intellij.ide.ui.UISettingsListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.EditorFactoryEvent
import com.intellij.openapi.editor.event.EditorFactoryListener
import com.intellij.openapi.editor.impl.EditorFactoryImpl
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.keymap.KeymapManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.WindowManager
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.messages.MessageBusConnection
import com.intellij.util.ui.ImageUtil
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.InlineEditParams
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.agent.protocol_generated.EditTask
import com.sourcegraph.cody.agent.protocol_generated.EditTask_RetryParams
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.chat.PromptHistory
import com.sourcegraph.cody.chat.ui.LlmDropdown
import com.sourcegraph.cody.edit.EditUtil.namedButton
import com.sourcegraph.cody.edit.EditUtil.namedLabel
import com.sourcegraph.cody.edit.EditUtil.namedPanel
import com.sourcegraph.cody.edit.actions.EditCodeAction
import com.sourcegraph.cody.ui.FrameMover
import com.sourcegraph.cody.ui.TextAreaHistoryManager
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Point
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import java.awt.geom.RoundRectangle2D
import java.awt.image.BufferedImage
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JFrame
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.JRootPane
import javax.swing.JScrollPane
import javax.swing.ListCellRenderer
import javax.swing.WindowConstants
import javax.swing.event.CaretListener

/** Pop up a user interface for giving Cody instructions to fix up code at the cursor. */
class EditCommandPrompt(
    val project: Project,
    val editor: Editor,
    dialogTitle: String,
    private val previousEdit: EditTask? = null
) : JFrame(), Disposable, DataProvider {

  private val logger = Logger.getInstance(EditCommandPrompt::class.java)

  private val offset = editor.caretModel.primaryCaret.offset

  private var connection: MessageBusConnection? = null

  private var model: String? = previousEdit?.model

  private val isDisposed: AtomicBoolean = AtomicBoolean(false)

  private val okButton =
      namedButton("ok-button").apply {
        text = "Edit Code"
        foreground = boldLabelColor()
        addActionListener { performOKAction() }
      }

  private val okButtonGroup =
      namedPanel("ok-button-group").apply {
        border = BorderFactory.createEmptyBorder(4, 0, 4, 4)
        isOpaque = false
        background = textFieldBackground()
        layout = BoxLayout(this, BoxLayout.X_AXIS)
        val activeKeymapShortcuts = KeymapUtil.getActiveKeymapShortcuts("cody.inlineEditEditCode")
        val shortcutLabel =
            if (activeKeymapShortcuts.shortcuts.isNotEmpty()) {
              namedLabel("ok-keyboard-shortcut-label")
                  .apply {
                    text = KeymapUtil.getShortcutsText(activeKeymapShortcuts.shortcuts)
                    // Spacing between key shortcut and button.
                    border = BorderFactory.createEmptyBorder(0, 0, 0, 12)
                  }
                  .also(::add)
            } else null
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
                performCancelAction()
              }
            })
      }

  private val instructionsField =
      InstructionsInputTextArea(this).apply { text = previousEdit?.instruction ?: lastPrompt }

  private val historyManager = TextAreaHistoryManager(instructionsField, promptHistory)

  private val llmDropdown =
      LlmDropdown(
              modelUsage = ModelUsage.EDIT,
              project = project,
              onSetSelectedItem = { model = it.id },
              this,
              chatModelFromState = null,
              model = model)
          .apply {
            foreground = boldLabelColor()
            background = textFieldBackground()
            border = BorderFactory.createLineBorder(mutedLabelColor(), 1, true)
            addKeyListener(
                object : KeyAdapter() {
                  override fun keyPressed(e: KeyEvent) {
                    if (e.keyCode == KeyEvent.VK_ESCAPE) {
                      performCancelAction()
                    }
                  }
                })
            renderer =
                object : ListCellRenderer<Model> {
                  private val defaultRenderer = renderer

                  override fun getListCellRendererComponent(
                      list: JList<out Model>?,
                      value: Model?,
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

  private lateinit var titleBar: JComponent

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

  private val documentListener =
      object : BulkAwareDocumentListener {
        override fun documentChanged(event: com.intellij.openapi.editor.event.DocumentEvent) {
          performCancelAction()
        }
      }

  private val editorFactoryListener =
      object : EditorFactoryListener {
        override fun editorReleased(event: EditorFactoryEvent) {
          if (editor != event.editor) return
          // Tab was closed.
          performCancelAction()
        }
      }

  private val tabFocusListener =
      object : FileEditorManagerListener {
        override fun selectionChanged(event: FileEditorManagerEvent) {
          val oldEditor = event.oldEditor ?: return
          if (oldEditor != editor) return
          // Our tab lost the focus.
          performCancelAction()
        }
      }

  private val focusListener =
      object : FocusAdapter() {
        override fun focusLost(e: FocusEvent?) {
          performCancelAction()
        }
      }

  private val windowFocusListener =
      object : WindowAdapter() {
        override fun windowLostFocus(e: WindowEvent?) {
          performCancelAction()
        }
      }

  private val historyLabel =
      namedLabel("history-label").apply {
        text = "↑↓ for history"
        horizontalAlignment = JLabel.CENTER
        isEnabled = historyManager.isHistoryAvailable() && instructionsField.text.isEmpty()
      }

  init {
    ApplicationManager.getApplication().assertIsDispatchThread()

    connection = ApplicationManager.getApplication().messageBus.connect(this)
    registerListeners()

    setupTextField()
    setupKeyListener()
    connection!!.subscribe(UISettingsListener.TOPIC, UISettingsListener { onThemeChange() })

    isUndecorated = true
    isAlwaysOnTop = true
    isResizable = true
    defaultCloseOperation = WindowConstants.DISPOSE_ON_CLOSE
    minimumSize = Dimension(DEFAULT_TEXT_FIELD_WIDTH, DIALOG_MINIMUM_HEIGHT)

    contentPane = DoubleBufferedRootPane()
    generatePromptUI()
    updateOkButtonState()
    FrameMover(this, titleBar)
    pack()

    shape = makeCornerShape(width, height)
    updateDialogPosition()
    isVisible = true

    project.putUserData(EDIT_COMMAND_PROMPT_KEY, this)
  }

  fun isOkActionEnabled() = isVisible && okButtonGroup.isEnabled && model != null

  private fun updateDialogPosition() {
    // Convert caret position to screen coordinates.
    val pointInEditor = editor.visualPositionToXY(editor.caretModel.visualPosition)

    if (editor.scrollingModel.visibleArea.contains(pointInEditor)) { // caret is visible
      val locationOnScreen = editor.contentComponent.locationOnScreen

      // Calculate the absolute screen position for the dialog, just below the current line.
      val dialogX = locationOnScreen.x + 100 // Position it consistently for now.
      val dialogY = locationOnScreen.y + pointInEditor.y + editor.lineHeight

      // Get the visible area of the editor
      val visibleArea = editor.scrollingModel.visibleArea

      // Check if the dialog would be out of the visible area
      val isOutOfVisibleAreaY =
          dialogY + height > locationOnScreen.y + visibleArea.y + visibleArea.height
      val isOutOfVisibleAreaX =
          dialogX + width > locationOnScreen.x + visibleArea.x + visibleArea.width

      if (isOutOfVisibleAreaY || isOutOfVisibleAreaX) {
        // Move the dialog to the middle of the screen
        setLocationRelativeTo(null)
      } else {
        // Set the calculated position
        location = Point(dialogX, dialogY)
      }
    } else {
      setLocationRelativeTo(getFrameForEditor(editor) ?: editor.component.rootPane)
    }
  }

  private fun registerListeners() {
    // Close dialog on document changes (user edits).
    editor.document.addDocumentListener(documentListener)

    // Close dialog when user switches to a different ab.
    connection?.subscribe(FileEditorManagerListener.FILE_EDITOR_MANAGER, tabFocusListener)

    // Close dialog when user closes the document. This call makes the listener auto-release.
    EditorFactoryImpl.getInstance().addEditorFactoryListener(editorFactoryListener, this)

    // Close dialog if window loses focus.
    addWindowFocusListener(windowFocusListener)
    addFocusListener(focusListener)
  }

  override fun setBounds(x: Int, y: Int, width: Int, height: Int) {
    super.setBounds(x, y, width, height)
    if (isUndecorated) {
      shape = makeCornerShape(width, height)
    }
  }

  private fun unregisterListeners() {
    try {
      editor.document.removeDocumentListener(documentListener)
      instructionsField.removeCaretListener(promptCaretListener)

      removeWindowFocusListener(windowFocusListener)
      removeFocusListener(focusListener)

      okButton.actionListeners.forEach { okButton.removeActionListener(it) }
    } catch (x: Exception) {
      logger.warn("Error removing listeners", x)
    }
  }

  private fun getFrameForEditor(editor: Editor): JFrame? {
    return WindowManager.getInstance().getFrame(editor.project ?: return null)
  }

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
      performCancelAction()
    }
  }

  @RequiresEdt
  private fun setupKeyListener() {
    instructionsField.addKeyListener(
        object : KeyAdapter() {
          override fun keyPressed(e: KeyEvent) {
            when (e.keyCode) {
              KeyEvent.VK_ESCAPE -> {
                performCancelAction()
              }
            }
          }
        })
  }

  private fun performCancelAction() {
    try {
      isVisible = false
      instructionsField.text?.let { lastPrompt = it } // Save last thing they typed.
      connection?.disconnect()
      connection = null
    } catch (x: Exception) {
      logger.warn("Error cancelling edit command prompt", x)
    } finally {
      dispose()
    }
  }

  @RequiresEdt
  private fun generatePromptUI() {
    contentPane.layout = BorderLayout()
    contentPane.apply {
      add(createTopRow(), BorderLayout.NORTH)
      add(createCenterPanel(), BorderLayout.CENTER)
      add(createBottomRow(), BorderLayout.SOUTH)
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
      titleBar = this
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
    try {
      val text = instructionsField.text
      if (text.isBlank()) {
        performCancelAction()
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
              agent.server.commandsEdit(InlineEditParams(text, currentModel, "edit")).get()
            }
        EditCodeAction.completedEditTasks[result.id] = result
      }
    } finally {
      performCancelAction()
    }
  }

  private fun makeCornerShape(width: Int, height: Int): RoundRectangle2D {
    return RoundRectangle2D.Double(
        0.0, 0.0, width.toDouble(), height.toDouble(), CORNER_RADIUS, CORNER_RADIUS)
  }

  override fun dispose() {
    if (!isDisposed.get()) {
      try {
        unregisterListeners()
      } finally {
        isDisposed.set(true)
      }
    }
  }

  private fun onThemeChange() {
    runInEdt {
      titleLabel.foreground = boldLabelColor() // custom background we manage ourselves
      revalidate()
      repaint()
    }
  }

  class DoubleBufferedRootPane : JRootPane() {
    private var offscreenImage: BufferedImage? = null

    override fun paintComponent(g: Graphics) {
      if (offscreenImage == null ||
          offscreenImage!!.width != width ||
          offscreenImage!!.height != height) {
        offscreenImage = ImageUtil.createImage(width, height, BufferedImage.TYPE_INT_ARGB)
      }
      val offscreenGraphics = offscreenImage!!.createGraphics()
      super.paintComponent(offscreenGraphics)
      offscreenGraphics.dispose()

      (g as Graphics2D).drawImage(offscreenImage, 0, 0, null)
    }
  }

  companion object {
    val EDIT_COMMAND_PROMPT_KEY: Key<EditCommandPrompt?> = Key.create("EDIT_COMMAND_PROMPT_KEY")

    // This is a fallback for the rare case when the screen size computations fail.
    const val DEFAULT_TEXT_FIELD_WIDTH: Int = 700

    const val DIALOG_MINIMUM_HEIGHT = 200

    private const val CORNER_RADIUS = 16.0

    // Used when the Editor/Document does not have an associated filename.
    private const val FILE_PATH_404 = "unknown file"

    private const val HISTORY_CAPACITY = 100
    val promptHistory = PromptHistory(HISTORY_CAPACITY)

    // The last text the user typed in without saving it, for continuity.
    var lastPrompt: String = ""

    fun clearLastPrompt() {
      lastPrompt = ""
    }

    // Caching these caused problems with theme switches, even when we
    // updated the cached values on theme-switch notifications.

    fun mutedLabelColor(): Color = EditUtil.getThemeColor("Label.disabledForeground")!!

    fun boldLabelColor(): Color = EditUtil.getThemeColor("Label.foreground")!!

    fun textFieldBackground(): Color = EditUtil.getThemeColor("TextField.background")!!

    /** Returns a compact symbol representation of the action's keyboard shortcut, if any. */
    @JvmStatic
    fun getShortcutDisplayString(actionId: String): String? {
      return KeymapManager.getInstance().activeKeymap.getShortcuts(actionId).firstOrNull()?.let {
        KeymapUtil.getShortcutText(it)
      }
    }
  }

  override fun getData(dataId: String): Any? {
    if (CommonDataKeys.PROJECT.`is`(dataId)) {
      return project
    }
    return null
  }
}
