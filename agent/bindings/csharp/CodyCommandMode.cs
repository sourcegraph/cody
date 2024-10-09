using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyCommandMode
  {
    [EnumMember(Value = "ask")]
    Ask,
    [EnumMember(Value = "edit")]
    Edit,
    [EnumMember(Value = "insert")]
    Insert,
  }
}
