using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ClientSideConfig
  {

    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; }

    [JsonPropertyName("apiEndpoint")]
    public string ApiEndpoint { get; set; }

    [JsonPropertyName("openAICompatible")]
    public OpenAICompatible OpenAICompatible { get; set; }
  }
}
