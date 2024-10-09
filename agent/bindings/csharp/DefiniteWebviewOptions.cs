using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DefiniteWebviewOptions
  {
    [JsonProperty(PropertyName = "enableScripts")]
    public bool EnableScripts { get; set; }
    [JsonProperty(PropertyName = "enableForms")]
    public bool EnableForms { get; set; }
    [JsonProperty(PropertyName = "enableOnlyCommandUris")]
    public string[] EnableOnlyCommandUris { get; set; }
    [JsonProperty(PropertyName = "localResourceRoots")]
    public string[] LocalResourceRoots { get; set; }
    [JsonProperty(PropertyName = "portMapping")]
    public PortMappingParams[] PortMapping { get; set; }
    [JsonProperty(PropertyName = "enableFindWidget")]
    public bool EnableFindWidget { get; set; }
    [JsonProperty(PropertyName = "retainContextWhenHidden")]
    public bool RetainContextWhenHidden { get; set; }
  }
}
