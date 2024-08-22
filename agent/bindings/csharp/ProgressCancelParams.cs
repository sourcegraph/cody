using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressCancelParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }
  }
}
