package com.sourcegraph.cody;

import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorFactory;
import com.intellij.openapi.editor.event.EditorEventMulticaster;
import com.intellij.openapi.editor.ex.EditorEventMulticasterEx;
import com.intellij.openapi.editor.ex.FocusChangeListener;
import com.intellij.openapi.fileEditor.FileDocumentManager;
import com.intellij.openapi.fileEditor.FileEditorManager;
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
    Project project = editor.getProject();
    VirtualFile file = FileDocumentManager.getInstance().getFile(editor.getDocument());

    if (ConfigUtil.isCodyEnabled() && project != null && file != null) {
      FileEditorManager fileEditorManager = FileEditorManager.getInstance(project);
      ProtocolTextDocument document = ProtocolTextDocument.fromVirtualFile(fileEditorManager, file);
      CodyAgentService.withAgent(
          project, agent -> agent.getServer().textDocumentDidFocus(document));
      CodyAgentCodebase.getInstance(project).onFileOpened(file);
    }
  }
}
