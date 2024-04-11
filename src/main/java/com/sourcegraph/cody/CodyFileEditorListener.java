package com.sourcegraph.cody;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.cody.agent.CodyAgent;
import com.sourcegraph.cody.agent.CodyAgentCodebase;
import com.sourcegraph.cody.agent.CodyAgentService;
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument;
import org.jetbrains.annotations.NotNull;

public class CodyFileEditorListener implements FileEditorManagerListener {
  @Override
  public void fileOpened(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    CodyAgentService.withAgent(source.getProject(), agent -> fileOpened(source, agent, file));
  }

  @Override
  public void fileClosed(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    var protocolTextFile = ProtocolTextDocument.fromVirtualFile(source, file);
    CodyAgentService.withAgent(
        source.getProject(), agent -> agent.getServer().textDocumentDidClose(protocolTextFile));
  }

  public static void fileOpened(
      @NotNull FileEditorManager source, CodyAgent codyAgent, @NotNull VirtualFile file) {
    var project = source.getProject();
    ApplicationManager.getApplication()
        .invokeLater(
            () -> {
              var textDocument = ProtocolTextDocument.fromVirtualFile(source, file);
              codyAgent.getServer().textDocumentDidOpen(textDocument);
              CodyAgentCodebase.getInstance(project).onFileOpened(file);
            });
  }

  public static void editorChanged(@NotNull Editor editor) {
    var project = editor.getProject();
    var file = FileDocumentManager.getInstance().getFile(editor.getDocument());
    if (project != null && file != null) {
      var fileEditorManager = FileEditorManager.getInstance(project);
      CodyAgentService.withAgent(project, agent -> fileOpened(fileEditorManager, agent, file));
    }
  }
}
