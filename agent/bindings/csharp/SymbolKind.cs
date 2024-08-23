using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum SymbolKind
  {
    [EnumMember(Value = "class")]
    Class,
    [EnumMember(Value = "function")]
    Function,
    [EnumMember(Value = "method")]
    Method,
  }
}
