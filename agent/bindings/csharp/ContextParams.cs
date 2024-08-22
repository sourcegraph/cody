using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ContextParams
  {

    [JsonPropertyName("user")]
    public int User { get; set; }
  }
}
