using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CancelParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }
  }
}
