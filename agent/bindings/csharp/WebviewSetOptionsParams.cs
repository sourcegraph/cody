using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetOptionsParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "options")]
    public DefiniteWebviewOptions Options { get; set; }
  }
}
