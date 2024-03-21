package com.sourcegraph.cody;

import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.editor.event.EditorEventMulticaster;
import com.intellij.openapi.editor.ex.EditorEventMulticasterEx;
import com.intellij.openapi.editor.ex.FocusChangeListener;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.startup.StartupActivity;
import com.intellij.openapi.vfs.VirtualFile;
import com.sourcegraph.cody.agent.CodyAgentCodebase;
import com.sourcegraph.cody.agent.CodyAgentService;
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument;
import com.sourcegraph.config.ConfigUtil;
import org.jetbrains.annotations.NotNull;

public final class CodyFocusChangeListener implements FocusChangeListener, StartupActivity {

  @Override
  public void runActivity(@NotNull Project project) {
    EditorEventMulticaster multicaster = EditorFactory.getInstance().getEventMulticaster();
    if (multicaster instanceof EditorEventMulticasterEx) {
      try {
        ((EditorEventMulticasterEx) multicaster)
            .addFocusChangeListener(this, CodyAgentService.getInstance(project));
      } catch (Exception e) {
        // Ignore exception https://github.com/sourcegraph/sourcegraph/issues/56032
      }
    }
  }

  @Override
  public void focusGained(@NotNull Editor editor) {
    if (!ConfigUtil.isCodyEnabled()) {
      return;
    }
    Project project = editor.getProject();
    if (project == null) {
      return;
    }

    VirtualFile file = FileDocumentManager.getInstance().getFile(editor.getDocument());
    if (file == null) {
      return;
    }

    CodyAgentService.withAgent(
        project,
        agent -> {
          try {
            // TODO: This is bad but needed to avoid race with file context of commands executed
            // through context menu
            Thread.sleep(100);
          } catch (InterruptedException ignored) {
          }
          agent.getServer().textDocumentDidFocus(ProtocolTextDocument.fromVirtualFile(file));
        });

    CodyAgentCodebase.getInstance(project).onFileOpened(project, file);
  }
}
