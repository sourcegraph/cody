using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProgressStartParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("options")]
    public ProgressOptions Options { get; set; }
  }
}
