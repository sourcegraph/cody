using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteItem
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("insertText")]
    public string InsertText { get; set; }

    [JsonPropertyName("range")]
    public Range Range { get; set; }
  }
}
