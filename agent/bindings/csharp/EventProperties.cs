using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EventProperties
  {
    [JsonProperty(PropertyName = "anonymousUserID")]
    public string AnonymousUserID { get; set; }
    [JsonProperty(PropertyName = "prefix")]
    public string Prefix { get; set; }
    [JsonProperty(PropertyName = "client")]
    public string Client { get; set; }
    [JsonProperty(PropertyName = "source")]
    public SourceEnum Source { get; set; } // Oneof: IDEEXTENSION

    public enum SourceEnum
    {
      [EnumMember(Value = "IDEEXTENSION")]
      IDEEXTENSION,
    }
  }
}
