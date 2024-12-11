package com.sourcegraph.find;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.Project;
import org.jetbrains.annotations.NotNull;

public class OpenFindAction extends AnAction implements DumbAware {
  @Override
  public void actionPerformed(@NotNull AnActionEvent event) {
    Project project = event.getProject();
    if (project != null) {
      FindService service = project.getService(FindService.class);
      service.showPopup();
    }
  }
}
