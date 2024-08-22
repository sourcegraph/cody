using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewCreateWebviewPanelOptions
  {

    [JsonPropertyName("enableScripts")]
    public bool EnableScripts { get; set; }

    [JsonPropertyName("enableForms")]
    public bool EnableForms { get; set; }

    [JsonPropertyName("enableOnlyCommandUris")]
    public string[] EnableOnlyCommandUris { get; set; }

    [JsonPropertyName("localResourceRoots")]
    public string[] LocalResourceRoots { get; set; }

    [JsonPropertyName("portMapping")]
    public PortMappingParams[] PortMapping { get; set; }

    [JsonPropertyName("enableFindWidget")]
    public bool EnableFindWidget { get; set; }

    [JsonPropertyName("retainContextWhenHidden")]
    public bool RetainContextWhenHidden { get; set; }
  }
}
