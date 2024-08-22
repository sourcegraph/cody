using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class OpenAICompatible
  {

    [JsonPropertyName("stopSequences")]
    public string[] StopSequences { get; set; }

    [JsonPropertyName("endOfText")]
    public string EndOfText { get; set; }

    [JsonPropertyName("contextSizeHintTotalCharacters")]
    public int ContextSizeHintTotalCharacters { get; set; }

    [JsonPropertyName("contextSizeHintPrefixCharacters")]
    public int ContextSizeHintPrefixCharacters { get; set; }

    [JsonPropertyName("contextSizeHintSuffixCharacters")]
    public int ContextSizeHintSuffixCharacters { get; set; }

    [JsonPropertyName("chatPreInstruction")]
    public string ChatPreInstruction { get; set; }

    [JsonPropertyName("editPostInstruction")]
    public string EditPostInstruction { get; set; }

    [JsonPropertyName("autocompleteSinglelineTimeout")]
    public int AutocompleteSinglelineTimeout { get; set; }

    [JsonPropertyName("autocompleteMultilineTimeout")]
    public int AutocompleteMultilineTimeout { get; set; }

    [JsonPropertyName("chatTopK")]
    public int ChatTopK { get; set; }

    [JsonPropertyName("chatTopP")]
    public int ChatTopP { get; set; }

    [JsonPropertyName("chatTemperature")]
    public int ChatTemperature { get; set; }

    [JsonPropertyName("chatMaxTokens")]
    public int ChatMaxTokens { get; set; }

    [JsonPropertyName("autoCompleteTopK")]
    public int AutoCompleteTopK { get; set; }

    [JsonPropertyName("autoCompleteTopP")]
    public int AutoCompleteTopP { get; set; }

    [JsonPropertyName("autoCompleteTemperature")]
    public int AutoCompleteTemperature { get; set; }

    [JsonPropertyName("autoCompleteSinglelineMaxTokens")]
    public int AutoCompleteSinglelineMaxTokens { get; set; }

    [JsonPropertyName("autoCompleteMultilineMaxTokens")]
    public int AutoCompleteMultilineMaxTokens { get; set; }

    [JsonPropertyName("editTopK")]
    public int EditTopK { get; set; }

    [JsonPropertyName("editTopP")]
    public int EditTopP { get; set; }

    [JsonPropertyName("editTemperature")]
    public int EditTemperature { get; set; }

    [JsonPropertyName("editMaxTokens")]
    public int EditMaxTokens { get; set; }
  }
}
