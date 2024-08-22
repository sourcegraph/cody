using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteResult
  {

    [JsonPropertyName("items")]
    public AutocompleteItem[] Items { get; set; }

    [JsonPropertyName("completionEvent")]
    public CompletionBookkeepingEvent CompletionEvent { get; set; }
  }
}
