using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewDidDisposeNativeParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }
  }
}
