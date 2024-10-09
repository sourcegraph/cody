using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class PortMappingParams
  {
    [JsonProperty(PropertyName = "webviewPort")]
    public int WebviewPort { get; set; }
    [JsonProperty(PropertyName = "extensionHostPort")]
    public int ExtensionHostPort { get; set; }
  }
}
