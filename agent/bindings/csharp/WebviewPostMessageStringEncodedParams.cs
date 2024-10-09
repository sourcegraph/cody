using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewPostMessageStringEncodedParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "stringEncodedMessage")]
    public string StringEncodedMessage { get; set; }
  }
}
