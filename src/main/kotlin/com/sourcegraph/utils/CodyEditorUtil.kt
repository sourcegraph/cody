package com.sourcegraph.utils

import com.intellij.application.options.CodeStyle
import com.intellij.ide.scratch.ScratchFileService
import com.intellij.ide.scratch.ScratchRootType
import com.intellij.injected.editor.EditorWindow
import com.intellij.lang.Language
import com.intellij.lang.LanguageUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.editor.impl.ImaginaryEditor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileTypes.FileTypeRegistry
import com.intellij.openapi.fileTypes.PlainTextLanguage
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.codeStyle.CommonCodeStyleSettings
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.io.createFile
import com.intellij.util.io.exists
import com.intellij.util.withScheme
import com.sourcegraph.cody.vscode.Range
import com.sourcegraph.config.ConfigUtil
import java.net.URI
import java.net.URISyntaxException
import java.util.Optional
import kotlin.io.path.toPath
import kotlin.math.min

object CodyEditorUtil {
  private val logger = Logger.getInstance(CodyEditorUtil::class.java)

  const val VIM_EXIT_INSERT_MODE_ACTION = "VimInsertExitModeAction"

  private const val VIM_MOTION_COMMAND = "Motion"
  private const val UP_COMMAND = "Up"
  private const val DOWN_COMMAND = "Down"
  private const val LEFT_COMMAND = "Left"
  private const val RIGHT_COMMAND = "Right"
  private const val MOVE_CARET_COMMAND = "Move Caret"

  @JvmStatic private val KEY_EDITOR_SUPPORTED = Key.create<Boolean>("cody.editorSupported")

  /**
   * Hints whether the editor wants autocomplete. Setting this value to false provides a hint to
   * disable autocomplete. If absent, assumes editors want autocomplete.
   */
  @JvmStatic val KEY_EDITOR_WANTS_AUTOCOMPLETE = Key.create<Boolean>("cody.editorWantsAutocomplete")

  /**
   * @param editor given editor
   * @return code style settings for the given editor, if null defaults to default app code style
   *   settings
   */
  @JvmStatic
  fun codeStyleSettings(editor: Editor): CommonCodeStyleSettings {
    return ReadAction.compute<CommonCodeStyleSettings, RuntimeException> {
      Optional.ofNullable(CodeStyle.getLanguageSettings(editor))
          .orElse(CodeStyle.getDefaultSettings())
    }
  }

  @JvmStatic
  fun getTextRange(document: Document, range: Range): TextRange {
    val start =
        min(
            document.getLineEndOffset(range.start.line),
            document.getLineStartOffset(range.start.line) + range.start.character)
    val end =
        min(
            document.getLineEndOffset(range.end.line),
            document.getLineStartOffset(range.end.line) + range.end.character)
    return TextRange.create(start, end)
  }

  @JvmStatic
  fun getAllOpenEditors(): Set<Editor> {
    return ProjectManager.getInstance()
        .openProjects
        .flatMap { project: Project -> FileEditorManager.getInstance(project).allEditors.toList() }
        .filterIsInstance<TextEditor>()
        .map { fileEditor: FileEditor -> (fileEditor as TextEditor).editor }
        .toSet()
  }

  @JvmStatic
  fun getFocusedEditorForAnActionEvent(e: AnActionEvent): Editor? {
    return e.project?.let { FileEditorManager.getInstance(it).selectedTextEditor }
  }

  @JvmStatic
  fun getLanguageForFocusedEditor(e: AnActionEvent): Language? {
    return getFocusedEditorForAnActionEvent(e)?.let { getLanguage(it) }
  }

  @JvmStatic
  fun isEditorInstanceSupported(editor: Editor): Boolean {
    return editor.project != null &&
        !editor.isViewer &&
        !editor.isOneLineMode &&
        editor !is EditorWindow &&
        editor !is ImaginaryEditor &&
        (editor !is EditorEx || !editor.isEmbeddedIntoDialogWrapper) &&
        KEY_EDITOR_WANTS_AUTOCOMPLETE[editor] != false
  }

  @JvmStatic
  private fun isEditorSupported(editor: Editor): Boolean {
    if (editor.isDisposed) {
      return false
    }
    val fromCache = KEY_EDITOR_SUPPORTED[editor]
    if (fromCache != null) {
      return fromCache
    }
    val isSupported =
        isEditorInstanceSupported(editor) && CodyProjectUtil.isProjectSupported(editor.project)
    KEY_EDITOR_SUPPORTED[editor] = isSupported
    return isSupported
  }

  @JvmStatic
  @RequiresEdt
  fun isEditorValidForAutocomplete(editor: Editor?): Boolean {
    return editor != null &&
        !editor.isDisposed &&
        editor.document.isWritable &&
        CodyProjectUtil.isProjectAvailable(editor.project) &&
        isEditorSupported(editor)
  }

  @JvmStatic
  fun isImplicitAutocompleteEnabledForEditor(editor: Editor): Boolean {
    return ConfigUtil.isCodyEnabled() &&
        ConfigUtil.isCodyAutocompleteEnabled() &&
        !isLanguageBlacklisted(editor)
  }

  @JvmStatic
  fun getLanguage(editor: Editor): Language? {
    val project = editor.project ?: return null
    return CodyLanguageUtil.getLanguage(project, editor.document)
  }

  @JvmStatic
  fun isLanguageBlacklisted(editor: Editor): Boolean {
    val language = getLanguage(editor) ?: return false
    return ConfigUtil.getBlacklistedAutocompleteLanguageIds().contains(language.id)
  }

  @JvmStatic
  fun isCommandExcluded(command: String?): Boolean {
    return (command.isNullOrEmpty() ||
        command.contains(VIM_MOTION_COMMAND) ||
        command == UP_COMMAND ||
        command == DOWN_COMMAND ||
        command == LEFT_COMMAND ||
        command == RIGHT_COMMAND ||
        command.contains(MOVE_CARET_COMMAND))
  }

  @JvmStatic
  fun getVirtualFile(editor: Editor): VirtualFile? =
      FileDocumentManager.getInstance().getFile(editor.document)

  @JvmStatic
  @RequiresEdt
  fun showDocument(
      project: Project,
      vf: VirtualFile,
      selection: Range? = null,
      preserveFocus: Boolean? = false
  ): Boolean {
    try {
      if (selection == null) {
        OpenFileDescriptor(project, vf).navigate(/* requestFocus= */ preserveFocus != true)
      } else {
        OpenFileDescriptor(
                project, vf, selection.start.line, /* logicalColumn= */ selection.start.character)
            .navigate(/* requestFocus= */ preserveFocus != true)
      }
      return true
    } catch (e: Exception) {
      logger.error("Cannot switch view to file ${vf.path}", e)
      return false
    }
  }

  @JvmStatic
  @RequiresEdt
  fun showDocument(
      project: Project,
      uri: URI,
      selection: Range? = null,
      preserveFocus: Boolean? = false
  ): Boolean {
    try {
      val vf =
          LocalFileSystem.getInstance().refreshAndFindFileByNioFile(uri.toPath()) ?: return false
      return showDocument(project, vf, selection, preserveFocus)
    } catch (e: Exception) {
      logger.error("Cannot switch view to file $uri", e)
      return false
    }
  }

  fun findFileOrScratch(project: Project, uriString: String): VirtualFile? {
    try {
      val uri = URI.create(uriString)
      val fixedUri = if (uriString.startsWith("untitled")) uri.withScheme("file") else uri
      return LocalFileSystem.getInstance().refreshAndFindFileByNioFile(fixedUri.toPath())
    } catch (e: URISyntaxException) {
      // Let's try scratch files
      val fileName = uriString.substringAfterLast('/').substringAfterLast('\\')
      return ScratchRootType.getInstance()
          .findFile(project, fileName, ScratchFileService.Option.existing_only)
    }
  }

  fun createFileOrScratch(
      project: Project,
      uriString: String,
      content: String? = null
  ): VirtualFile? {
    try {
      val uri = URI.create(uriString).withScheme("file")
      if (!uri.toPath().exists()) uri.toPath().createFile()
      val vf = LocalFileSystem.getInstance().refreshAndFindFileByNioFile(uri.toPath())
      content?.let {
        WriteCommandAction.runWriteCommandAction(project) { vf?.setBinaryContent(it.toByteArray()) }
      }
      return vf
    } catch (e: URISyntaxException) {
      val fileName = uriString.substringAfterLast('/').substringAfterLast('\\')
      val fileType = FileTypeRegistry.getInstance().getFileTypeByFileName(fileName)
      val language = LanguageUtil.getFileTypeLanguage(fileType) ?: PlainTextLanguage.INSTANCE
      return ScratchRootType.getInstance()
          .createScratchFile(
              project,
              fileName,
              language,
              content ?: "",
              ScratchFileService.Option.create_if_missing)
    }
  }
}
