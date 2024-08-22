using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ShowWindowMessageParams
  {

    [JsonPropertyName("severity")]
    public SeverityEnum Severity { get; set; } // Oneof: error, warning, information

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("options")]
    public MessageOptions Options { get; set; }

    [JsonPropertyName("items")]
    public string[] Items { get; set; }

    public enum SeverityEnum
    {
      [JsonPropertyName("error")]
      Error,
      [JsonPropertyName("warning")]
      Warning,
      [JsonPropertyName("information")]
      Information,
    }
  }
}
