using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionLogID
  {
    public string Value { get; set; }

    public static implicit operator string(CompletionLogID value) => value.Value;
    public static implicit operator CompletionLogID(string value) => new CompletionLogID { Value = value };
  }
}
