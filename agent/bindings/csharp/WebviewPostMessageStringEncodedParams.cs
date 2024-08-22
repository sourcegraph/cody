using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewPostMessageStringEncodedParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("stringEncodedMessage")]
    public string StringEncodedMessage { get; set; }
  }
}
