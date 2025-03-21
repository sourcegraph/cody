package com.sourcegraph.config;

import com.intellij.openapi.actionSystem.AnAction;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.actionSystem.Presentation;
import com.intellij.openapi.actionSystem.impl.ActionButton;
import com.intellij.openapi.actionSystem.impl.SimpleDataContext;
import com.intellij.openapi.project.Project;
import com.intellij.util.IconUtil;
import com.intellij.util.ui.JBDimension;
import com.intellij.util.ui.JBUI;
import com.sourcegraph.Icons;
import com.sourcegraph.cody.config.actions.OpenCodySettingsEditorAction;
import javax.swing.*;
import org.jetbrains.annotations.NotNull;

public class GoToPluginSettingsButtonFactory {

  @NotNull
  public static ActionButton createGoToPluginSettingsButton(Project project) {
    JBDimension actionButtonSize = JBUI.size(22, 22);

    Presentation presentation = new Presentation("Open Plugin Settings");

    AnAction action =
        new AnAction() {
          @Override
          public void actionPerformed(@NotNull AnActionEvent e) {
            new OpenCodySettingsEditorAction()
                .actionPerformed(e.withDataContext(SimpleDataContext.getProjectContext(project)));
          }
        };

    ActionButton button =
        new ActionButton(
            action, presentation, "Find with Sourcegraph popup header", actionButtonSize);

    Icon scaledIcon = IconUtil.scale(Icons.GearPlain, button, 13f / 12f);
    presentation.setIcon(scaledIcon);

    return button;
  }
}
