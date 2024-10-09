using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ModelTag
  {
    [EnumMember(Value = "power")]
    Power,
    [EnumMember(Value = "speed")]
    Speed,
    [EnumMember(Value = "balanced")]
    Balanced,
    [EnumMember(Value = "recommended")]
    Recommended,
    [EnumMember(Value = "deprecated")]
    Deprecated,
    [EnumMember(Value = "experimental")]
    Experimental,
    [EnumMember(Value = "pro")]
    Pro,
    [EnumMember(Value = "free")]
    Free,
    [EnumMember(Value = "enterprise")]
    Enterprise,
    [EnumMember(Value = "gateway")]
    Gateway,
    [EnumMember(Value = "byok")]
    Byok,
    [EnumMember(Value = "local")]
    Local,
    [EnumMember(Value = "ollama")]
    Ollama,
    [EnumMember(Value = "dev")]
    Dev,
  }
}
