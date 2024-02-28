package com.sourcegraph.cody;

import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.sourcegraph.cody.ui.BGTActionSetter;
import com.sourcegraph.config.ConfigUtil;
import org.jetbrains.annotations.NotNull;

public class CodyActionGroup extends DefaultActionGroup {

  public CodyActionGroup() {
    BGTActionSetter.runUpdateOnBackgroundThread(this);
  }

  @Override
  public boolean isDumbAware() {
    return true;
  }

  @Override
  public void update(@NotNull AnActionEvent e) {
    super.update(e);
    e.getPresentation().setVisible(ConfigUtil.isCodyEnabled());
  }
}
