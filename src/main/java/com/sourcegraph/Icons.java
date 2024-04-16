package com.sourcegraph;

import com.intellij.openapi.util.IconLoader;
import javax.swing.*;

public interface Icons {
  Icon SourcegraphLogo = IconLoader.getIcon("/icons/sourcegraphLogo.svg", Icons.class);
  Icon CodyLogo = IconLoader.getIcon("/icons/codyLogo.svg", Icons.class);
  Icon GearPlain = IconLoader.getIcon("/icons/gearPlain.svg", Icons.class);
  Icon RepoHostBitbucket = IconLoader.getIcon("/icons/repo-host-bitbucket.svg", Icons.class);
  Icon RepoHostGeneric = IconLoader.getIcon("/icons/repo-host-generic.svg", Icons.class);
  Icon RepoHostGitHub = IconLoader.getIcon("/icons/repo-host-github.svg", Icons.class);
  Icon RepoHostGitlab = IconLoader.getIcon("/icons/repo-host-gitlab.svg", Icons.class);
}
