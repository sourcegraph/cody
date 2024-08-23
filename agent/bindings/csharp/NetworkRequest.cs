using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class NetworkRequest
  {
    [JsonProperty(PropertyName = "url")]
    public string Url { get; set; }
    [JsonProperty(PropertyName = "body")]
    public string Body { get; set; }
    [JsonProperty(PropertyName = "error")]
    public string Error { get; set; }
  }
}
