using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ApiVersionId
  {
    public string Value { get; set; }

    public static implicit operator string(ApiVersionId value) => value.Value;
    public static implicit operator ApiVersionId(string value) => new ApiVersionId { Value = value };
  }
}
