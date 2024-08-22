using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EventProperties
  {

    [JsonPropertyName("anonymousUserID")]
    public string AnonymousUserID { get; set; }

    [JsonPropertyName("prefix")]
    public string Prefix { get; set; }

    [JsonPropertyName("client")]
    public string Client { get; set; }

    [JsonPropertyName("source")]
    public SourceEnum Source { get; set; } // Oneof: IDEEXTENSION

    public enum SourceEnum
    {
      [JsonPropertyName("IDEEXTENSION")]
      IDEEXTENSION,
    }
  }
}
