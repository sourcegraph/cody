package com.sourcegraph.cody.autocomplete.action

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.AutocompleteItem
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.utils.CodyEditorUtil
import java.util.concurrent.ConcurrentHashMap

class CycleCodyAutocompleteActionHandler(private val cycleDirection: CycleDirection) :
    AutocompleteActionHandler() {
  private val logger = Logger.getInstance(CycleCodyAutocompleteActionHandler::class.java)

  override fun isEnabledForCaret(editor: Editor, caret: Caret, dataContext: DataContext?): Boolean {
    val project = editor.project ?: return false
    val allAutocompleteItems = getAllAutocompleteItems(caret)
    val cacheKey = editor.cycleAutocompleteCacheKey(caret)
    autocompleteItemsCache[cacheKey] = allAutocompleteItems
    val isActionEnabled =
        CodyEditorUtil.isEditorInstanceSupported(editor) &&
            CodyAgentService.isConnected(project) &&
            allAutocompleteItems.isNotEmpty()
    if (!isActionEnabled) autocompleteItemsCache.clear()
    return isActionEnabled
  }

  override fun doExecute(editor: Editor, maybeCaret: Caret?, dataContext: DataContext?) {
    (maybeCaret ?: getSingleCaret(editor) ?: return).let { caret ->
      val cacheKey = editor.cycleAutocompleteCacheKey(caret)
      val oldItems = autocompleteItemsCache[cacheKey] ?: return
      logger.debug(
          "${cycleDirection.name} cycle autocomplete, suggestion items number: ${oldItems.size}")
      val newItems =
          when (cycleDirection) {
            CycleDirection.FORWARD -> oldItems.drop(1) + oldItems.take(1)
            CycleDirection.BACKWARD -> oldItems.takeLast(1) + oldItems.dropLast(1)
          }
      ApplicationManager.getApplication().invokeLater {
        CodyAutocompleteManager.instance.let {
          it.clearAutocompleteSuggestions(editor)
          it.displayAgentAutocomplete(editor, caret.offset, newItems, editor.inlayModel)
        }
        autocompleteItemsCache[cacheKey] = newItems
      }
    }
  }

  companion object {
    enum class CycleDirection {
      FORWARD,
      BACKWARD
    }

    data class CacheKey(val caretOffset: Int, val documentName: String) {
      constructor(
          caret: Caret,
          editor: Editor
      ) : this(caret.offset, CodyEditorUtil.getVirtualFile(editor)?.name ?: "")
    }

    infix fun Editor.cycleAutocompleteCacheKey(caret: Caret) = CacheKey(caret, this)

    private val autocompleteItemsCache = ConcurrentHashMap<CacheKey, List<AutocompleteItem>>()
  }
}
