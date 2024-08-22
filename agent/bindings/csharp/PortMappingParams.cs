using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class PortMappingParams
  {

    [JsonPropertyName("webviewPort")]
    public int WebviewPort { get; set; }

    [JsonPropertyName("extensionHostPort")]
    public int ExtensionHostPort { get; set; }
  }
}
