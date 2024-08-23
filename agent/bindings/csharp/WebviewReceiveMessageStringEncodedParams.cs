using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewReceiveMessageStringEncodedParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "messageStringEncoded")]
    public string MessageStringEncoded { get; set; }
  }
}
