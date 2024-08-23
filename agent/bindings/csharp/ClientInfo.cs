using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientInfo
  {
    [JsonProperty(PropertyName = "name")]
    public string Name { get; set; }
    [JsonProperty(PropertyName = "version")]
    public string Version { get; set; }
    [JsonProperty(PropertyName = "ideVersion")]
    public string IdeVersion { get; set; }
    [JsonProperty(PropertyName = "workspaceRootUri")]
    public string WorkspaceRootUri { get; set; }
    [JsonProperty(PropertyName = "globalStateDir")]
    public string GlobalStateDir { get; set; }
    [JsonProperty(PropertyName = "workspaceRootPath")]
    public string WorkspaceRootPath { get; set; }
    [JsonProperty(PropertyName = "extensionConfiguration")]
    public ExtensionConfiguration ExtensionConfiguration { get; set; }
    [JsonProperty(PropertyName = "capabilities")]
    public ClientCapabilities Capabilities { get; set; }
  }
}
