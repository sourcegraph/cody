using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class IgnoreTestResult
  {
    [JsonProperty(PropertyName = "policy")]
    public PolicyEnum Policy { get; set; } // Oneof: ignore, use

    public enum PolicyEnum
    {
      [EnumMember(Value = "ignore")]
      Ignore,
      [EnumMember(Value = "use")]
      Use,
    }
  }
}
