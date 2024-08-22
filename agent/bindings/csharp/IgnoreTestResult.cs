using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class IgnoreTestResult
  {

    [JsonPropertyName("policy")]
    public PolicyEnum Policy { get; set; } // Oneof: ignore, use

    public enum PolicyEnum
    {
      [JsonPropertyName("ignore")]
      Ignore,
      [JsonPropertyName("use")]
      Use,
    }
  }
}
