package com.sourcegraph.cody.vscode;

import com.intellij.lang.Language;
import com.intellij.lang.LanguageUtil;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.cody.agent.protocol_generated.Position;
import java.net.URI;
import java.util.Optional;
import org.jetbrains.annotations.NotNull;

/** Implementation of vscode.TextDocument backed by IntelliJ's Editor. */
public class IntelliJTextDocument implements TextDocument {
  public final Editor editor;
  public VirtualFile file;
  public Language language;

  public IntelliJTextDocument(Editor editor, Project project) {
    this.editor = editor;
    Document document = editor.getDocument();
    this.file = FileDocumentManager.getInstance().getFile(document);
    this.language = LanguageUtil.getLanguageForPsi(project, file);
  }

  @Override
  public URI uri() {
    return URI.create(file.getUrl());
  }

  @Override
  @NotNull
  public String fileName() {
    return file.getName();
  }

  @Override
  public String getText() {
    return this.editor.getDocument().getText();
  }

  @Override
  public Position positionAt(int offset) {
    Document document = this.editor.getDocument();
    int line = document.getLineNumber(offset);
    int character = offset - document.getLineStartOffset(line);
    return new Position(line, character);
  }

  @Override
  public @NotNull Optional<String> getLanguageId() {
    return Optional.ofNullable(this.language).map(Language::getID);
  }
}
