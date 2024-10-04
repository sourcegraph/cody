package com.sourcegraph.cody.autocomplete

import com.github.difflib.DiffUtils
import com.github.difflib.patch.DeltaType
import com.github.difflib.patch.Patch
import com.intellij.codeInsight.hint.HintManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.client.ClientSessionsManager
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayModel
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.wm.ToolWindowId
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.GotItTooltip
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.AutocompleteItem
import com.sourcegraph.cody.agent.protocol.AutocompleteResult
import com.sourcegraph.cody.agent.protocol.CompletionItemParams
import com.sourcegraph.cody.autocomplete.Utils.triggerAutocompleteAsync
import com.sourcegraph.cody.autocomplete.render.AutocompleteRendererType
import com.sourcegraph.cody.autocomplete.render.CodyAutocompleteBlockElementRenderer
import com.sourcegraph.cody.autocomplete.render.CodyAutocompleteElementRenderer
import com.sourcegraph.cody.autocomplete.render.CodyAutocompleteSingleLineRenderer
import com.sourcegraph.cody.autocomplete.render.InlayModelUtil.getAllInlaysForEditor
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.statusbar.CodyStatusService.Companion.resetApplication
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.cody.vscode.IntelliJTextDocument
import com.sourcegraph.cody.vscode.TextDocument
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.config.ConfigUtil.isCodyEnabled
import com.sourcegraph.config.UserLevelConfig
import com.sourcegraph.utils.CodyEditorUtil.getAllOpenEditors
import com.sourcegraph.utils.CodyEditorUtil.getLanguage
import com.sourcegraph.utils.CodyEditorUtil.getTextRange
import com.sourcegraph.utils.CodyEditorUtil.isCommandExcluded
import com.sourcegraph.utils.CodyEditorUtil.isEditorValidForAutocomplete
import com.sourcegraph.utils.CodyEditorUtil.isImplicitAutocompleteEnabledForEditor
import com.sourcegraph.utils.CodyFormatter
import java.util.concurrent.atomic.AtomicReference
import java.util.stream.Collectors

/** Responsible for triggering and clearing inline code completions (the autocomplete feature). */
@Service
class CodyAutocompleteManager {
  private val logger = Logger.getInstance(CodyAutocompleteManager::class.java)
  private val currentJob = AtomicReference(CancellationToken())

  /**
   * Clears any already rendered autocomplete suggestions for the given editor and cancels any
   * pending ones.
   *
   * @param editor the editor to clear autocomplete suggestions for
   */
  @RequiresEdt
  fun clearAutocompleteSuggestions(editor: Editor) {
    // Cancel any running job
    cancelCurrentJob(editor.project)

    // Clear any existing inline elements
    disposeInlays(editor)
  }

  /**
   * Clears any already rendered autocomplete suggestions for all open editors and cancels any
   * pending ones.
   */
  @RequiresEdt
  fun clearAutocompleteSuggestionsForAllProjects() {
    getAllOpenEditors().forEach { clearAutocompleteSuggestions(it) }
  }

  @RequiresEdt
  fun clearAutocompleteSuggestionsForLanguageIds(languageIds: List<String?>) =
      getAllOpenEditors()
          .filter { e -> getLanguage(e)?.let { l -> languageIds.contains(l.id) } ?: false }
          .forEach { clearAutocompleteSuggestions(it) }

  @RequiresEdt
  fun clearAutocompleteSuggestionsForLanguageId(languageId: String) =
      clearAutocompleteSuggestionsForLanguageIds(listOf(languageId))

  @RequiresEdt
  fun disposeInlays(editor: Editor) {
    if (editor.isDisposed) {
      return
    }
    getAllInlaysForEditor(editor)
        .filter { inlay -> inlay.renderer is CodyAutocompleteElementRenderer }
        .forEach { disposable -> Disposer.dispose(disposable) }
  }

  /**
   * Triggers auto-complete suggestions for the given editor at the specified offset.
   *
   * @param editor The editor instance to provide autocomplete for.
   * @param offset The character offset in the editor to trigger auto-complete at.
   */
  fun triggerAutocomplete(
      editor: Editor,
      offset: Int,
      triggerKind: InlineCompletionTriggerKind,
      lookupString: String? = null
  ) {
    val isTriggeredExplicitly = triggerKind == InlineCompletionTriggerKind.INVOKE

    val project = editor.project
    if (project == null) {
      logger.warn("triggered autocomplete with null project")
      return
    }

    if (isTriggeredExplicitly) CodyAgentService.withAgentRestartIfNeeded(project) {}

    val isTriggeredImplicitly = !isTriggeredExplicitly
    if (!isCodyEnabled()) {
      if (isTriggeredExplicitly) {
        logger.warn("ignoring explicit autocomplete because Cody is disabled")
      }
      return
    }
    if (!isEditorValidForAutocomplete(editor)) {
      if (isTriggeredExplicitly) {
        logger.warn("triggered autocomplete with invalid editor $editor")
      }
      return
    }
    val isRemoteDev = ClientSessionsManager.getAppSession()?.isRemote ?: false
    if (isRemoteDev) {
      return
    }
    if (isTriggeredImplicitly && !isImplicitAutocompleteEnabledForEditor(editor)) {
      return
    }
    val currentCommand = CommandProcessor.getInstance().currentCommandName
    if (isTriggeredImplicitly &&
        lookupString.isNullOrEmpty() &&
        isCommandExcluded(currentCommand)) {
      return
    }

    val textDocument: TextDocument = IntelliJTextDocument(editor, project)

    if (isTriggeredExplicitly && CodyAuthenticationManager.getInstance().hasNoActiveAccount()) {
      HintManager.getInstance().showErrorHint(editor, "Cody: Sign in to use autocomplete")
      return
    }
    cancelCurrentJob(project)
    val cancellationToken = CancellationToken()
    currentJob.set(cancellationToken)
    val lineNumber = editor.document.getLineNumber(offset)
    val caretPositionInLine = offset - editor.document.getLineStartOffset(lineNumber)
    val originalText = editor.document.getText(TextRange(offset - caretPositionInLine, offset))

    val originalTextTrimmed = originalText.takeLastWhile { c -> c != '.' && !c.isWhitespace() }
    if (!lookupString.isNullOrEmpty() && !lookupString.startsWith(originalTextTrimmed)) {
      logger.debug("Skipping autocompletion for lookup element due to not matching prefix")
      return
    }

    triggerAutocompleteAsync(
        project,
        editor,
        offset,
        textDocument,
        triggerKind,
        cancellationToken,
        lookupString,
        originalText,
        logger) { autocompleteResult ->
          processAutocompleteResult(
              editor, offset, triggerKind, autocompleteResult, cancellationToken)
        }
  }

  private fun processAutocompleteResult(
      editor: Editor,
      offset: Int,
      triggerKind: InlineCompletionTriggerKind,
      result: AutocompleteResult,
      cancellationToken: CancellationToken,
  ) {
    if (Thread.interrupted() || cancellationToken.isCancelled) {
      if (triggerKind == InlineCompletionTriggerKind.INVOKE) logger.warn("autocomplete canceled")
      return
    }
    val inlayModel = editor.inlayModel
    if (result.items.isEmpty()) {
      // NOTE(olafur): it would be nice to give the user a visual hint when this happens.
      // We don't do anything now because it's unclear what would be the most idiomatic
      // IntelliJ API to use.
      if (triggerKind == InlineCompletionTriggerKind.INVOKE)
          logger.warn("autocomplete returned empty suggestions")
      return
    }
    ApplicationManager.getApplication().invokeLater {
      if (cancellationToken.isCancelled) {
        return@invokeLater
      }
      cancellationToken.dispose()
      clearAutocompleteSuggestions(editor)
      // https://github.com/sourcegraph/jetbrains/issues/350
      // CodyFormatter.formatStringBasedOnDocument needs to be on a write action.
      WriteCommandAction.runWriteCommandAction(editor.project) {
        displayAgentAutocomplete(editor, offset, result.items, inlayModel, triggerKind)
      }
    }
  }

  /**
   * Render inlay hints for unprocessed autocomplete results from the agent.
   *
   * The reason we have a custom code path to render hints for agent autocompletions is because we
   * can use `insertText` directly and the `range` encloses the entire line.
   */
  @RequiresEdt
  fun displayAgentAutocomplete(
      editor: Editor,
      cursorOffset: Int,
      items: List<AutocompleteItem>,
      inlayModel: InlayModel,
      triggerKind: InlineCompletionTriggerKind,
  ) {
    if (editor.isDisposed) {
      return
    }

    val project = editor.project
    val defaultItem = items.firstOrNull() ?: return
    val range = getTextRange(editor.document, defaultItem.range)
    val originalText = editor.document.getText(range)

    val formattedCompletionText =
        if (project == null ||
            System.getProperty("cody.autocomplete.enableFormatting") == "false") {
          defaultItem.insertText
        } else {
          CodyFormatter.formatStringBasedOnDocument(
              defaultItem.insertText, project, editor.document, range, cursorOffset)
        }

    // Run Myers diff between the existing text in the document and the `insertText` that is
    // returned from the agent.
    // The diff algorithm returns a list of "deltas" that give us the minimal number of additions we
    // need to make to the document.
    val patch = diff(originalText, defaultItem.insertText)
    if (!patch.deltas.all { delta -> delta.type == DeltaType.INSERT }) {
      if (triggerKind == InlineCompletionTriggerKind.INVOKE ||
          UserLevelConfig.isVerboseLoggingEnabled()) {
        logger.warn("Skipping autocomplete with non-insert deltas: $patch")
      }
      // Skip completions that need to delete or change characters in the existing document. We only
      // want completions to add changes to the document.
      return
    }

    project?.let {
      CodyAgentService.withAgent(project) { agent ->
        agent.server.completionSuggested(CompletionItemParams(defaultItem.id))
      }
    }

    defaultItem.insertText = formattedCompletionText
    val cursorOffsetInOriginalText = cursorOffset - range.startOffset

    if (cursorOffsetInOriginalText > originalText.length) {
      logger.warn(
          """Skipping autocomplete because cursor position is outside of text range:
            |Original text: `$originalText`
            |Completion range: $range
            |Cursor offset: $cursorOffset
            |Cursor offset in completion text: $cursorOffsetInOriginalText
          """
              .trimMargin())
      return
    }

    val originalTextBeforeCursor = originalText.substring(0, cursorOffsetInOriginalText)
    val originalTextAfterCursor = originalText.substring(cursorOffsetInOriginalText)
    val completionText =
        formattedCompletionText
            .removePrefix(originalTextBeforeCursor)
            .removeSuffix(originalTextAfterCursor)
    if (completionText.trim().isBlank()) return

    val lineBreaks = listOf("\r\n", "\n", "\r")
    val startsInline = lineBreaks.none { separator -> completionText.startsWith(separator) }

    var inlay: Inlay<*>? = null
    if (startsInline) {
      val text = completionText.lines().first()
      if (text.isNotEmpty()) {
        val renderer =
            CodyAutocompleteSingleLineRenderer(text, items, editor, AutocompleteRendererType.INLINE)
        inlay =
            inlayModel.addInlineElement(cursorOffset, /* relatesToPrecedingText = */ true, renderer)
      }
    }
    val lines = completionText.lines()
    if (lines.size > 1) {
      val text =
          (if (startsInline) lines.drop(1) else lines).dropWhile { it.isBlank() }.joinToString("\n")
      if (text.isNotEmpty()) {
        val renderer = CodyAutocompleteBlockElementRenderer(text, items, editor)
        val inlay2 =
            inlayModel.addBlockElement(
                /* offset = */ cursorOffset,
                /* relatesToPrecedingText = */ true,
                /* showAbove = */ false,
                /* priority = */ Int.MAX_VALUE,
                /* renderer = */ renderer)
        if (inlay == null) {
          inlay = inlay2
        }
      }
    }

    if (inlay?.bounds?.location != null) {
      val gotit =
          GotItTooltip(
                  "cody.autocomplete.gotIt",
                  CodyBundle.getString("gotit.autocomplete.message")
                      .fmt(
                          KeymapUtil.getShortcutText("cody.acceptAutocompleteAction"),
                          KeymapUtil.getShortcutText("cody.cycleForwardAutocompleteAction"),
                          KeymapUtil.getShortcutText("cody.cycleBackAutocompleteAction")),
                  inlay /* dispose tooltip alongside inlay */)
              .withHeader(CodyBundle.getString("gotit.autocomplete.header"))
              .withPosition(Balloon.Position.above)
              .withIcon(Icons.CodyLogo)
              .andShowCloseShortcut()
      try {
        gotit.show(editor.contentComponent) { _, _ -> inlay.bounds!!.location }
      } catch (e: Exception) {
        logger.info("Failed to display gotit tooltip", e)
      }
    }

    if (inlay?.bounds?.location != null && project != null) {
      val isProjectViewVisible =
          ToolWindowManager.getInstance(project).getToolWindow(ToolWindowId.PROJECT_VIEW)?.isVisible
              ?: false
      val position =
          if (isProjectViewVisible) Balloon.Position.atLeft
          else if (inlay.bounds!!.location.y < 150) Balloon.Position.below
          else Balloon.Position.above
      val gotit =
          GotItTooltip(
                  "cody.autocomplete.gotIt",
                  CodyBundle.getString("gotit.autocomplete.message")
                      .fmt(
                          KeymapUtil.getShortcutText("cody.acceptAutocompleteAction"),
                          KeymapUtil.getShortcutText("cody.cycleForwardAutocompleteAction"),
                          KeymapUtil.getShortcutText("cody.cycleBackAutocompleteAction")),
                  inlay /* dispose tooltip alongside inlay */)
              .withHeader(CodyBundle.getString("gotit.autocomplete.header"))
              .withPosition(position)
              .withIcon(Icons.CodyLogo)
              .andShowCloseShortcut()
      try {
        gotit.show(editor.contentComponent) { _, _ ->
          val location = inlay.bounds!!.location
          if (position == Balloon.Position.below) {
            val lineHeight = getLineHeight()
            location.setLocation(location.x, location.y + lineHeight)
          }
          location
        }
      } catch (e: Exception) {
        logger.info("Failed to display gotit tooltip", e)
      }
    }
  }

  private fun getLineHeight(): Int {
    val colorsManager = EditorColorsManager.getInstance()
    val fontPreferences = colorsManager.globalScheme.fontPreferences
    val fontSize = fontPreferences.getSize(fontPreferences.fontFamily)
    val lineSpacing = fontPreferences.lineSpacing.toInt()
    val extraMargin = 4
    return fontSize + lineSpacing + extraMargin
  }

  private fun cancelCurrentJob(project: Project?) {
    currentJob.get().abort()
    project?.let { resetApplication(it) }
  }

  companion object {
    @JvmStatic
    val instance: CodyAutocompleteManager
      get() = service()

    @JvmStatic
    fun diff(a: String, b: String): Patch<String> =
        DiffUtils.diff(characterList(a), characterList(b))

    private fun characterList(value: String): List<String> =
        value.chars().mapToObj { c -> c.toChar().toString() }.collect(Collectors.toList())
  }
}
