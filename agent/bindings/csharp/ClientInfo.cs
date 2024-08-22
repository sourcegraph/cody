using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientInfo
  {

    [JsonPropertyName("name")]
    public string Name { get; set; }

    [JsonPropertyName("version")]
    public string Version { get; set; }

    [JsonPropertyName("ideVersion")]
    public string IdeVersion { get; set; }

    [JsonPropertyName("workspaceRootUri")]
    public string WorkspaceRootUri { get; set; }

    [JsonPropertyName("globalStateDir")]
    public string GlobalStateDir { get; set; }

    [JsonPropertyName("workspaceRootPath")]
    public string WorkspaceRootPath { get; set; }

    [JsonPropertyName("extensionConfiguration")]
    public ExtensionConfiguration ExtensionConfiguration { get; set; }

    [JsonPropertyName("capabilities")]
    public ClientCapabilities Capabilities { get; set; }
  }
}
