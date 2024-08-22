using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DisabledParams
  {

    [JsonPropertyName("reason")]
    public string Reason { get; set; }
  }
}
