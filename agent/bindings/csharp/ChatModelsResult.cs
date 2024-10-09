using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatModelsResult
  {
    [JsonProperty(PropertyName = "models")]
    public Model[] Models { get; set; }
  }
}
