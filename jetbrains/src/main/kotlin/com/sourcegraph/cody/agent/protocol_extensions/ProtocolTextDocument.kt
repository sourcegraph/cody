package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.codeInsight.codeVision.ui.popup.layouter.bottom
import com.intellij.codeInsight.codeVision.ui.popup.layouter.right
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.event.CaretEvent
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.SelectionEvent
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.intellij_extensions.codyPosition
import com.sourcegraph.cody.agent.intellij_extensions.codyRange
import com.sourcegraph.cody.agent.protocol_generated.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol_generated.ProtocolTextDocumentContentChangeEvent
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.cody.agent.protocol_generated.TestingParams
import com.sourcegraph.cody.listeners.CodyFileEditorListener
import com.sourcegraph.config.ConfigUtil
import java.awt.Point
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

object ProtocolTextDocumentExt {
  private val logger = Logger.getInstance(CodyFileEditorListener::class.java)

  private fun getTestingParams(
      uri: String,
      content: String? = null,
      selection: Range? = null,
      selectedText: String? = null
  ): TestingParams? {
    if (ConfigUtil.isDevMode()) {
      return TestingParams(
          selectedText = selectedText,
          sourceOfTruthDocument =
              ProtocolTextDocument(
                  uri = uri,
                  content = content,
                  selection = selection,
              ))
    }

    return null
  }

  @RequiresEdt
  private fun getSelection(editor: Editor): Range? {
    return editor.document.codyRange(
        editor.selectionModel.selectionStart, editor.selectionModel.selectionEnd)
  }

  @RequiresEdt
  private fun getVisibleRange(editor: Editor): Range {
    val visibleArea = editor.scrollingModel.visibleArea

    // As a rule of thumb, we avoid logical positions because they interpret some characters
    // creatively (example, tab as two spaces). We use logical positions for "visible range" where
    // 100% precision is not needed.
    val startOffset = editor.xyToLogicalPosition(visibleArea.location)
    val startOffsetLine = max(startOffset.line, 0)
    val startOffsetColumn = max(startOffset.column, 0)

    val endOffset = editor.xyToLogicalPosition(Point(visibleArea.right, visibleArea.bottom))
    val endOffsetLine = max(0, min(endOffset.line, editor.document.lineCount - 1))
    val endOffsetColumn = min(endOffset.column, editor.document.getLineEndOffset(endOffsetLine))

    return Range(
        Position(startOffsetLine, startOffsetColumn), Position(endOffsetLine, endOffsetColumn))
  }

  @RequiresEdt
  fun fromEditorWithOffsetSelection(editor: Editor, event: CaretEvent): ProtocolTextDocument? {
    val caret = event.caret ?: return null
    val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
    val start = editor.document.codyPosition(caret.offset)
    val selection = Range(start, start)
    val uri = fileUriFor(file) ?: return null
    return ProtocolTextDocument(
        uri = uri,
        selection = selection,
        testing = getTestingParams(uri, selection = selection, selectedText = ""))
  }

  @RequiresEdt
  fun fromEditorWithRangeSelection(editor: Editor, event: SelectionEvent): ProtocolTextDocument? {
    val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
    val uri = fileUriFor(file) ?: return null
    val selection = editor.document.codyRange(event.newRange.startOffset, event.newRange.endOffset)
    return ProtocolTextDocument(
        uri = uri,
        selection = selection,
        testing =
            getTestingParams(
                uri = uri,
                content = editor.document.text,
                selection = selection,
                selectedText = editor.selectionModel.selectedText))
  }

  private val isFullDocumentSyncEnabled =
      System.getProperty("cody-agent.fullDocumentSyncEnabled") == "true"

  @RequiresEdt
  fun fromEditorForDocumentEvent(editor: Editor, event: DocumentEvent): ProtocolTextDocument? {
    val file = FileDocumentManager.getInstance().getFile(event.document) ?: return null
    val uri = fileUriFor(file) ?: return null
    val selection = event.document.codyRange(editor.caretModel.offset, editor.caretModel.offset)

    val content =
        if (isFullDocumentSyncEnabled) {
          event.document.text
        } else {
          null
        }
    return ProtocolTextDocument(
        uri = uri,
        content = content,
        selection = selection,
        contentChanges =
            if (isFullDocumentSyncEnabled) {
              null
            } else {
              // IMPORTANT: note that we can't use `event.document` helpers to compute the end
              // position because `event.document.text` includes the latest change
              // (`event.newFragment`). Instead, we manually compute the end position based on
              // `event.oldFragment`.
              val start = event.document.codyPosition(event.offset)
              val endLine = start.line + event.oldFragment.count { it == '\n' }
              val endCharacter: Int =
                  if (endLine == start.line) {
                    start.character.toInt() + event.oldFragment.length
                  } else {
                    event.oldFragment.length - event.oldFragment.lastIndexOf('\n') - 1
                  }
              val end = Position(endLine.toInt(), endCharacter)
              listOf(
                  ProtocolTextDocumentContentChangeEvent(
                      Range(start, end), event.newFragment.toString()))
            },
        testing =
            getTestingParams(uri, selection = selection, content = content ?: event.document.text))
  }

  @RequiresEdt
  fun fromEditor(editor: Editor): ProtocolTextDocument? {
    val file = FileDocumentManager.getInstance().getFile(editor.document) ?: return null
    return fromVirtualEditorFile(editor, file)
  }

  @RequiresEdt
  fun fromVirtualEditorFile(
      editor: Editor,
      file: VirtualFile,
  ): ProtocolTextDocument? {
    val content = FileDocumentManager.getInstance().getDocument(file)?.text
    val uri = fileUriFor(file) ?: return null
    val selection = getSelection(editor)
    return ProtocolTextDocument(
        uri = uri,
        content = content,
        selection = selection,
        visibleRange = getVisibleRange(editor),
        testing = getTestingParams(uri = uri, content = content, selection = selection))
  }

  fun fromVirtualFile(file: VirtualFile): ProtocolTextDocument? {
    val content = FileDocumentManager.getInstance().getDocument(file)?.text
    val uri = fileUriFor(file) ?: return null
    return ProtocolTextDocument(
        uri = uri, content = content, testing = getTestingParams(uri = uri, content = content))
  }

  fun fileUriFor(file: VirtualFile): String? {
    return normalizeFileUri(file.url)
  }

  fun normalizeFileUri(uriString: String): String? {
    val hasFileScheme = uriString.startsWith("file://")

    if (uriString.contains("://") && !hasFileScheme) {
      logger.warn("Unsupported URI scheme, skipping file processing: $uriString")
      return null
    }

    val path =
        (if (hasFileScheme) uriString.removePrefix("file://") else uriString).replace("\\", "/")

    // Normalize WSL paths
    val wslPrefix = "//wsl$"
    if (path.startsWith(wslPrefix)) {
      val newPath = "//wsl.localhost${path.removePrefix(wslPrefix)}"
      return if (hasFileScheme) "file://$newPath" else newPath
    }

    // Normalize drive letters for Windows
    val driveLetterPattern = """^(/?\w):/""".toRegex()
    val normalizedPath =
        driveLetterPattern.replace(path) { matchResult ->
          val driveLetter = matchResult.groupValues[1].lowercase(Locale.getDefault())
          "${driveLetter}:/"
        }

    if (!hasFileScheme) return normalizedPath
    if (path.matches(Regex("^/[^/].*"))) {
      return "file://$normalizedPath"
    }
    return "file:///$normalizedPath"
  }
}
