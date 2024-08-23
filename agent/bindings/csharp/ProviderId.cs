using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProviderId
  {
    public string Value { get; set; }

    public static implicit operator string(ProviderId value) => value.Value;
    public static implicit operator ProviderId(string value) => new ProviderId { Value = value };
  }
}
