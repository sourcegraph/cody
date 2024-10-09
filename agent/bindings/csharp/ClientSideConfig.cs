using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientSideConfig
  {
    [JsonProperty(PropertyName = "apiKey")]
    public string ApiKey { get; set; }
    [JsonProperty(PropertyName = "apiEndpoint")]
    public string ApiEndpoint { get; set; }
    [JsonProperty(PropertyName = "openAICompatible")]
    public OpenAICompatible OpenAICompatible { get; set; }
  }
}
