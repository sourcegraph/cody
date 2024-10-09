using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum DiagnosticSeverity
  {
    [EnumMember(Value = "error")]
    Error,
    [EnumMember(Value = "warning")]
    Warning,
    [EnumMember(Value = "info")]
    Info,
    [EnumMember(Value = "suggestion")]
    Suggestion,
  }
}
