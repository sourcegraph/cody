package com.sourcegraph.cody;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Computable;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.cody.agent.CodyAgent;
import com.sourcegraph.cody.agent.CodyAgentCodebase;
import com.sourcegraph.cody.agent.CodyAgentService;
import com.sourcegraph.cody.agent.protocol.TextDocument;
import com.sourcegraph.config.ConfigUtil;
import org.jetbrains.annotations.NotNull;

public class CodyFileEditorListener implements FileEditorManagerListener {
  @Override
  public void fileOpened(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    if (!ConfigUtil.isCodyEnabled()) {
      return;
    }

    CodyAgentService.withAgent(
        source.getProject(), agent -> fileOpened(source.getProject(), agent, file));
  }

  @Override
  public void fileClosed(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    if (!ConfigUtil.isCodyEnabled()) {
      return;
    }

    CodyAgentService.withAgent(
        source.getProject(),
        agent -> agent.getServer().textDocumentDidClose(TextDocument.fromVirtualFile(file)));
  }

  public static void fileOpened(Project project, CodyAgent codyAgent, @NotNull VirtualFile file) {
    Document document =
        ApplicationManager.getApplication()
            .runReadAction(
                (Computable<Document>) () -> FileDocumentManager.getInstance().getDocument(file));
    if (document != null) {
      TextDocument textDocument = TextDocument.fromVirtualFile(file, document.getText());
      codyAgent.getServer().textDocumentDidOpen(textDocument);
    }

    CodyAgentCodebase.getInstance(project).onFileOpened(project, file);
  }
}
