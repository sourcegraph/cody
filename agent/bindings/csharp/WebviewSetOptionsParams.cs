using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetOptionsParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("options")]
    public DefiniteWebviewOptions Options { get; set; }
  }
}
