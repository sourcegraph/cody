package com.sourcegraph.cody;

import com.intellij.openapi.actionSystem.ActionUpdateThread;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.project.Project;
import com.sourcegraph.cody.auth.CodyAuthService;
import com.sourcegraph.config.ConfigUtil;
import org.jetbrains.annotations.NotNull;

public class CodyActionGroup extends DefaultActionGroup {

  @Override
  public @NotNull ActionUpdateThread getActionUpdateThread() {
    return ActionUpdateThread.EDT;
  }

  @Override
  public boolean isDumbAware() {
    return true;
  }

  @Override
  public void update(@NotNull AnActionEvent e) {
    super.update(e);

    Project project = e.getProject();
    e.getPresentation()
        .setVisible(
            ConfigUtil.isCodyEnabled()
                && project != null
                && CodyAuthService.getInstance(project).isActivated());
  }
}
