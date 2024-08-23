using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyTaskState
  {
    [EnumMember(Value = "Idle")]
    Idle,
    [EnumMember(Value = "Working")]
    Working,
    [EnumMember(Value = "Inserting")]
    Inserting,
    [EnumMember(Value = "Applying")]
    Applying,
    [EnumMember(Value = "Applied")]
    Applied,
    [EnumMember(Value = "Finished")]
    Finished,
    [EnumMember(Value = "Error")]
    Error,
    [EnumMember(Value = "Pending")]
    Pending,
  }
}
