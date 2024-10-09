using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ShowWindowMessageParams
  {
    [JsonProperty(PropertyName = "severity")]
    public SeverityEnum Severity { get; set; } // Oneof: error, warning, information
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
    [JsonProperty(PropertyName = "options")]
    public MessageOptions Options { get; set; }
    [JsonProperty(PropertyName = "items")]
    public string[] Items { get; set; }

    public enum SeverityEnum
    {
      [EnumMember(Value = "error")]
      Error,
      [EnumMember(Value = "warning")]
      Warning,
      [EnumMember(Value = "information")]
      Information,
    }
  }
}
