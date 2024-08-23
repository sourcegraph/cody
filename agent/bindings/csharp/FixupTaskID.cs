using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class FixupTaskID
  {
    public string Value { get; set; }

    public static implicit operator string(FixupTaskID value) => value.Value;
    public static implicit operator FixupTaskID(string value) => new FixupTaskID { Value = value };
  }
}
