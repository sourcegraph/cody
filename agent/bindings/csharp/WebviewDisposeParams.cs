using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewDisposeParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }
  }
}
