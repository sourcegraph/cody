using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum SymbolKind
  {
    [JsonPropertyName("class")]
    Class,
    [JsonPropertyName("function")]
    Function,
    [JsonPropertyName("method")]
    Method,
  }
}
