using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ModelRef
  {

    [JsonPropertyName("providerId")]
    public ProviderId ProviderId { get; set; }

    [JsonPropertyName("apiVersionId")]
    public ApiVersionId ApiVersionId { get; set; }

    [JsonPropertyName("modelId")]
    public ModelId ModelId { get; set; }
  }
}
