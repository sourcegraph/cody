package com.sourcegraph.cody;

import com.intellij.openapi.editor.Document;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.fileEditor.FileEditorManagerListener;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.cody.agent.CodyAgent;
import com.sourcegraph.cody.agent.CodyAgentClient;
import com.sourcegraph.cody.agent.CodyAgentServer;
import com.sourcegraph.cody.agent.protocol.TextDocument;
import com.sourcegraph.config.ConfigUtil;
import java.util.concurrent.TimeUnit;
import org.jetbrains.annotations.NotNull;

public class CodyFileEditorListener implements FileEditorManagerListener {
  @Override
  public void fileOpened(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    if (!ConfigUtil.isCodyEnabled()) {
      return;
    }
    Document document = FileDocumentManager.getInstance().getDocument(file);
    if (document == null) {
      return;
    }

    CodyAgent.getInitializedServer(source.getProject())
        .completeOnTimeout(null, 3, TimeUnit.SECONDS)
        .thenAccept(
            server -> {
              if (server == null) {
                return;
              }
              if (!CodyAgent.isConnected(source.getProject())) {
                return;
              }

              server.textDocumentDidOpen(new TextDocument(file.getPath(), document.getText()));

              CodyAgentClient client = CodyAgent.getClient(source.getProject());
              if (client.codebase == null) {
                return;
              }
              client.codebase.onFileOpened(source.getProject(), file);
            });
  }

  @Override
  public void fileClosed(@NotNull FileEditorManager source, @NotNull VirtualFile file) {
    if (!ConfigUtil.isCodyEnabled()) {
      return;
    }
    CodyAgentServer server = CodyAgent.getServer(source.getProject());
    if (server == null) {
      return;
    }
    server.textDocumentDidClose(new TextDocument(file.getPath()));
  }
}
