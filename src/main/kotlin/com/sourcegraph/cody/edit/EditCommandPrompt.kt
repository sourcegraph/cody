package com.sourcegraph.cody.edit

import com.intellij.ide.ui.UISettingsListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.KeyboardShortcut
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
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.WindowManager
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.messages.MessageBusConnection
import com.intellij.util.ui.ImageUtil
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.chat.ui.LlmDropdown
import com.sourcegraph.cody.edit.EditUtil.namedButton
import com.sourcegraph.cody.edit.EditUtil.namedLabel
import com.sourcegraph.cody.edit.EditUtil.namedPanel
import com.sourcegraph.cody.edit.sessions.EditCodeSession
import com.sourcegraph.cody.ui.FrameMover
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Cursor
import java.awt.Dimension
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Point
import java.awt.Toolkit
import java.awt.event.ActionEvent
import java.awt.event.FocusEvent
import java.awt.event.FocusListener
import java.awt.event.InputEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.WindowEvent
import java.awt.event.WindowFocusListener
import java.awt.geom.RoundRectangle2D
import java.awt.image.BufferedImage
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.AbstractAction
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
import javax.swing.KeyStroke
import javax.swing.ListCellRenderer
import javax.swing.WindowConstants
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/** Pop up a user interface for giving Cody instructions to fix up code at the cursor. */
class EditCommandPrompt(
    val controller: FixupService,
    val editor: Editor,
    dialogTitle: String,
    instruction: String? = null
) : JFrame(), Disposable, FixupService.ActiveFixupSessionStateListener {
  private val logger = Logger.getInstance(EditCommandPrompt::class.java)

  private val offset = editor.caretModel.primaryCaret.offset

  private val escapeKeyStroke = KeyStroke.getKeyStroke(KeyEvent.VK_ESCAPE, 0)

  private var connection: MessageBusConnection? = null

  private val isDisposed: AtomicBoolean = AtomicBoolean(false)

  // Key for activating the OK button. It's not a globally registered action.
  // We use a local action and just wire it up manually.
  private val enterKeyStroke =
      if (SystemInfo.isMac) {
        // Mac: Command+Enter
        KeyStroke.getKeyStroke(
            KeyEvent.VK_ENTER, Toolkit.getDefaultToolkit().getMenuShortcutKeyMaskEx())
      } else {
        // Others: Control+Enter
        KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, InputEvent.CTRL_DOWN_MASK)
      }

  private val okButton =
      namedButton("ok-button").apply {
        text = "Edit Code"
        foreground = boldLabelColor()

        addActionListener { performOKAction() }
        registerKeyboardAction(
            { performOKAction() }, enterKeyStroke, JComponent.WHEN_IN_FOCUSED_WINDOW)
      }

  private val cancelLabel =
      namedLabel("esc-cancel-label").apply {
        text = "[esc] to cancel"
        foreground = mutedLabelColor()
        cursor = Cursor(Cursor.HAND_CURSOR)
        addMouseListener( // Make it work like ESC key if you click it.
            object : MouseAdapter() {
              override fun mouseClicked(e: MouseEvent) {
                clearActivePrompt()
              }
            })
      }

  private val instructionsField =
      InstructionsInputTextArea(this).apply {
        if (instruction != null) {
          text = instruction
        } else {
          text = lastPrompt
        }
        if (text.isNullOrBlank() && promptHistory.isNotEmpty()) {
          text = promptHistory.getPrevious()
        }
      }

  private val llmDropdown =
      LlmDropdown(
              modelUsage = ModelUsage.EDIT,
              project = controller.project,
              onSetSelectedItem = {},
              this,
              chatModelProviderFromState = null)
          .apply {
            foreground = boldLabelColor()
            background = textFieldBackground()
            border = BorderFactory.createLineBorder(mutedLabelColor(), 1, true)
            addKeyListener(
                object : KeyAdapter() {
                  override fun keyPressed(e: KeyEvent) {
                    if (e.keyCode == KeyEvent.VK_ESCAPE) {
                      clearActivePrompt()
                    }
                  }
                })
            renderer =
                object : ListCellRenderer<ChatModelsResponse.ChatModelProvider> {
                  private val defaultRenderer = renderer

                  override fun getListCellRendererComponent(
                      list: JList<out ChatModelsResponse.ChatModelProvider>?,
                      value: ChatModelsResponse.ChatModelProvider?,
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

  private val textFieldListener =
      object : DocumentListener {
        override fun insertUpdate(e: DocumentEvent?) {
          handleDocumentChange()
        }

        override fun removeUpdate(e: DocumentEvent?) {
          handleDocumentChange()
        }

        override fun changedUpdate(e: DocumentEvent?) {
          handleDocumentChange()
        }

        private fun handleDocumentChange() {
          runInEdt {
            updateOkButtonState()
            checkForInterruptions()
          }
        }
      }

  private val documentListener =
      object : BulkAwareDocumentListener {
        override fun documentChanged(event: com.intellij.openapi.editor.event.DocumentEvent) {
          clearActivePrompt()
        }
      }

  private val editorFactoryListener =
      object : EditorFactoryListener {
        override fun editorReleased(event: EditorFactoryEvent) {
          if (editor != event.editor) return
          // Tab was closed.
          clearActivePrompt()
        }
      }

  private val tabFocusListener =
      object : FileEditorManagerListener {
        override fun selectionChanged(event: FileEditorManagerEvent) {
          val oldEditor = event.oldEditor ?: return
          if (oldEditor != editor) return
          // Our tab lost the focus.
          clearActivePrompt()
        }
      }

  private val focusListener =
      object : FocusListener {
        override fun focusGained(e: FocusEvent?) {}

        override fun focusLost(e: FocusEvent?) {
          clearActivePrompt()
        }
      }

  private val windowFocusListener =
      object : WindowFocusListener {
        override fun windowGainedFocus(e: WindowEvent?) {}

        override fun windowLostFocus(e: WindowEvent?) {
          clearActivePrompt()
        }
      }

  init {
    ApplicationManager.getApplication().assertIsDispatchThread()

    // Register with FixupService as a failsafe if the project closes. Normally we're disposed
    // sooner, when the dialog is closed or focus is lost.
    Disposer.register(controller, this)
    connection = ApplicationManager.getApplication().messageBus.connect(this)
    registerListeners()
    // Don't reset the session, just any previous instructions dialog.
    controller.currentEditPrompt.get()?.clearActivePrompt()

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
  }

  private fun updateDialogPosition() {
    // Convert caret position to screen coordinates.
    val pointInEditor = editor.visualPositionToXY(editor.caretModel.visualPosition)

    if (editor.scrollingModel.visibleArea.contains(pointInEditor)) { // caret is visible
      val locationOnScreen = editor.contentComponent.locationOnScreen

      // Calculate the absolute screen position for the dialog, just below current line.
      val dialogX = locationOnScreen.x + 100 // Position it consistently for now.
      val dialogY = locationOnScreen.y + pointInEditor.y + editor.lineHeight
      location = Point(dialogX, dialogY)
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

    FixupService.getInstance(controller.project).addListener(this)
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
      instructionsField.document.removeDocumentListener(textFieldListener)

      removeWindowFocusListener(windowFocusListener)
      removeFocusListener(focusListener)

      okButton.actionListeners.forEach { okButton.removeActionListener(it) }
    } catch (x: Exception) {
      logger.warn("Error removing listeners", x)
    }
  }

  private fun clearActivePrompt() {
    performCancelAction()
  }

  private fun getFrameForEditor(editor: Editor): JFrame? {
    return WindowManager.getInstance().getFrame(editor.project ?: return null)
  }

  @RequiresEdt
  private fun setupTextField() {
    instructionsField.document.addDocumentListener(textFieldListener)
  }

  @RequiresEdt
  private fun updateOkButtonState() {
    okButton.isEnabled =
        instructionsField.text.isNotBlank() &&
            !FixupService.getInstance(controller.project).isEditInProgress()
  }

  @RequiresEdt
  private fun checkForInterruptions() {
    if (editor.isDisposed || editor.isViewer || !editor.document.isWritable) {
      clearActivePrompt()
    }
  }

  @RequiresEdt
  private fun setupKeyListener() {
    instructionsField.addKeyListener(
        object : KeyAdapter() {
          override fun keyPressed(e: KeyEvent) {
            when (e.keyCode) {
              KeyEvent.VK_UP -> instructionsField.setTextAndSelectAll(promptHistory.getPrevious())
              KeyEvent.VK_DOWN -> instructionsField.setTextAndSelectAll(promptHistory.getNext())
              KeyEvent.VK_ESCAPE -> {
                clearActivePrompt()
              }
            }
            updateOkButtonState()
          }
        })
  }

  override fun getRootPane(): JRootPane {
    val rootPane = super.getRootPane()
    val inputMap = rootPane.getInputMap(JComponent.WHEN_IN_FOCUSED_WINDOW)
    val actionMap = rootPane.actionMap

    inputMap.put(escapeKeyStroke, "ESCAPE")
    actionMap.put(
        "ESCAPE",
        object : AbstractAction() {
          override fun actionPerformed(e: ActionEvent?) {
            clearActivePrompt()
          }
        })

    return rootPane
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

      add(
          namedLabel("history-label").apply {
            text = if (promptHistory.isNotEmpty()) "↑↓ for history" else ""
            horizontalAlignment = JLabel.CENTER
          })

      add(Box.createHorizontalGlue())
      add(createOKButtonGroup())
    }
  }

  private fun createOKButtonGroup(): JPanel {
    return namedPanel("ok-button-group").apply {
      border = BorderFactory.createEmptyBorder(4, 0, 4, 4)
      isOpaque = false
      background = textFieldBackground()
      layout = BoxLayout(this, BoxLayout.X_AXIS)
      add(
          namedLabel("ok-keyboard-shortcut-label").apply {
            text = KeymapUtil.getShortcutText(KeyboardShortcut(enterKeyStroke, null))
            // Spacing between key shortcut and button.
            border = BorderFactory.createEmptyBorder(0, 0, 0, 12)
          })
      add(okButton)
    }
  }

  @RequiresEdt
  fun performOKAction() {
    val text = instructionsField.text
    if (text.isNotBlank()) {
      promptHistory.add(text)
      val project = editor.project
      // TODO: How do we show user feedback when an error like this happens?
      if (project == null) {
        logger.warn("Project was null when trying to add an edit session")
        return
      }

      fun editCode() = runInEdt { EditCodeSession(controller, editor, text, llmDropdown.item) }
      val activeSession = controller.getActiveSession()
      if (activeSession != null) {
        activeSession.afterSessionFinished { editCode() }
        activeSession.undo()
      } else {
        editCode()
      }
    }
    clearActivePrompt()
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

  // TODO: Was hoping this would help avoid flicker while resizing.
  // Needs more work, but I think this is likely the right general approach.
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
    // This is a fallback for the rare case when the screen size computations fail.
    const val DEFAULT_TEXT_FIELD_WIDTH: Int = 700

    const val DIALOG_MINIMUM_HEIGHT = 200

    private const val CORNER_RADIUS = 16.0

    // Used when the Editor/Document does not have an associated filename.
    private const val FILE_PATH_404 = "unknown file"

    private const val HISTORY_CAPACITY = 100
    val promptHistory = HistoryManager<String>(HISTORY_CAPACITY)

    // The last text the user typed in without saving it, for continuity.
    var lastPrompt: String = ""

    // Caching these caused problems with theme switches, even when we
    // updated the cached values on theme-switch notifications.

    fun mutedLabelColor(): Color = EditUtil.getThemeColor("Label.disabledForeground")!!

    fun boldLabelColor(): Color = EditUtil.getThemeColor("Label.foreground")!!

    fun textFieldBackground(): Color = EditUtil.getThemeColor("TextField.background")!!

    /** Returns a compact symbol representation of the action's keyboard shortcut, if any. */
    @JvmStatic
    fun getShortcutText(actionId: String): String? {
      // If the keystroke has a registered shortcut, use that text.
      val action = ActionManager.getInstance().getAction(actionId)
      action?.shortcutSet?.shortcuts?.forEach { shortcut ->
        if (shortcut is KeyboardShortcut) {
          // This will return the shortcut in a format suitable for display,
          // including the correct symbols for the current OS.
          return KeymapUtil.getShortcutText(shortcut)
        }
      }
      // We have a few actions that share the same keystroke, because
      // they are similar operations in different contexts. They cannot be
      // registered in plugin.xml directly, because of collisions; instead,
      // we create intermediate actions to dispatch based on the mode.
      // Here, we just have to hardwire what we know the original sequence is.
      // TODO: There must be a way to convert a KeyStroke to these programmatically.
      // IntelliJ's Settings keymap viewer/editor shows them.
      return when (actionId) {
        "cody.editCodeAction",
        "cody.inlineEditRetryAction" ->
            getKeyStrokeDisplayString(
                KeyStroke.getKeyStroke(
                    KeyEvent.VK_ENTER, InputEvent.CTRL_DOWN_MASK or InputEvent.SHIFT_DOWN_MASK))
        "cody.inlineEditCancelAction",
        "cody.inlineEditUndoAction",
        "cody.inlineEditDismissAction" ->
            getKeyStrokeDisplayString(
                KeyStroke.getKeyStroke(
                    KeyEvent.VK_BACK_SPACE,
                    InputEvent.CTRL_DOWN_MASK or InputEvent.SHIFT_DOWN_MASK))
        else -> null
      }
    }

    private fun getKeyStrokeDisplayString(keyStroke: KeyStroke): String {
      val sb = StringBuilder()

      if (keyStroke.modifiers and InputEvent.CTRL_DOWN_MASK != 0) {
        sb.append("^")
      }
      if (keyStroke.modifiers and InputEvent.META_DOWN_MASK != 0) {
        sb.append("⌘")
      }
      if (keyStroke.modifiers and InputEvent.ALT_DOWN_MASK != 0) {
        sb.append("⌥")
      }
      if (keyStroke.modifiers and InputEvent.SHIFT_DOWN_MASK != 0) {
        sb.append("⇧")
      }

      when (keyStroke.keyCode) {
        KeyEvent.VK_ENTER -> sb.append("⏎")
        KeyEvent.VK_BACK_SPACE -> sb.append("⌫")
        else -> sb.append(KeyEvent.getKeyText(keyStroke.keyCode))
      }

      return sb.toString()
    }
  }

  override fun fixupSessionStateChanged(isInProgress: Boolean) {
    runInEdt { okButton.isEnabled = !isInProgress }
  }
}
