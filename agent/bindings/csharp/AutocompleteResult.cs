using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteResult
  {
    [JsonProperty(PropertyName = "items")]
    public AutocompleteItem[] Items { get; set; }
    [JsonProperty(PropertyName = "completionEvent")]
    public CompletionBookkeepingEvent CompletionEvent { get; set; }
  }
}
