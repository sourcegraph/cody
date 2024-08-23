using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ModelRef
  {
    [JsonProperty(PropertyName = "providerId")]
    public ProviderId ProviderId { get; set; }
    [JsonProperty(PropertyName = "apiVersionId")]
    public ApiVersionId ApiVersionId { get; set; }
    [JsonProperty(PropertyName = "modelId")]
    public ModelId ModelId { get; set; }
  }
}
