using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ChatModelsResult
  {

    [JsonPropertyName("models")]
    public Model[] Models { get; set; }
  }
}
