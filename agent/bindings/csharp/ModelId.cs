using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ModelId
  {
    public string Value { get; set; }

    public static implicit operator string(ModelId value) => value.Value;
    public static implicit operator ModelId(string value) => new ModelId { Value = value };
  }
}
