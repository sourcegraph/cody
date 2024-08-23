using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyCommandType
  {
    [EnumMember(Value = "workspace")]
    Workspace,
    [EnumMember(Value = "user")]
    User,
    [EnumMember(Value = "default")]
    Default,
    [EnumMember(Value = "experimental")]
    Experimental,
    [EnumMember(Value = "recently used")]
    Recently used,
  }
}
