using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewReceiveMessageStringEncodedParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("messageStringEncoded")]
    public string MessageStringEncoded { get; set; }
  }
}
