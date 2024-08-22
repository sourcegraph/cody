using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class NetworkRequest
  {

    [JsonPropertyName("url")]
    public string Url { get; set; }

    [JsonPropertyName("body")]
    public string Body { get; set; }

    [JsonPropertyName("error")]
    public string Error { get; set; }
  }
}
