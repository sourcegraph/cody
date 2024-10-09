using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodeActionTriggerKind
  {
    [EnumMember(Value = "Invoke")]
    Invoke,
    [EnumMember(Value = "Automatic")]
    Automatic,
  }
}
