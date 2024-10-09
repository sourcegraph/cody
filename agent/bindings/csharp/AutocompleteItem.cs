using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteItem
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "insertText")]
    public string InsertText { get; set; }
    [JsonProperty(PropertyName = "range")]
    public Range Range { get; set; }
  }
}
