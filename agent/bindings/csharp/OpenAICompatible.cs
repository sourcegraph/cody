using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class OpenAICompatible
  {
    [JsonProperty(PropertyName = "stopSequences")]
    public string[] StopSequences { get; set; }
    [JsonProperty(PropertyName = "endOfText")]
    public string EndOfText { get; set; }
    [JsonProperty(PropertyName = "contextSizeHintTotalCharacters")]
    public int ContextSizeHintTotalCharacters { get; set; }
    [JsonProperty(PropertyName = "contextSizeHintPrefixCharacters")]
    public int ContextSizeHintPrefixCharacters { get; set; }
    [JsonProperty(PropertyName = "contextSizeHintSuffixCharacters")]
    public int ContextSizeHintSuffixCharacters { get; set; }
    [JsonProperty(PropertyName = "chatPreInstruction")]
    public string ChatPreInstruction { get; set; }
    [JsonProperty(PropertyName = "editPostInstruction")]
    public string EditPostInstruction { get; set; }
    [JsonProperty(PropertyName = "autocompleteSinglelineTimeout")]
    public int AutocompleteSinglelineTimeout { get; set; }
    [JsonProperty(PropertyName = "autocompleteMultilineTimeout")]
    public int AutocompleteMultilineTimeout { get; set; }
    [JsonProperty(PropertyName = "chatTopK")]
    public int ChatTopK { get; set; }
    [JsonProperty(PropertyName = "chatTopP")]
    public int ChatTopP { get; set; }
    [JsonProperty(PropertyName = "chatTemperature")]
    public int ChatTemperature { get; set; }
    [JsonProperty(PropertyName = "chatMaxTokens")]
    public int ChatMaxTokens { get; set; }
    [JsonProperty(PropertyName = "autoCompleteTopK")]
    public int AutoCompleteTopK { get; set; }
    [JsonProperty(PropertyName = "autoCompleteTopP")]
    public int AutoCompleteTopP { get; set; }
    [JsonProperty(PropertyName = "autoCompleteTemperature")]
    public int AutoCompleteTemperature { get; set; }
    [JsonProperty(PropertyName = "autoCompleteSinglelineMaxTokens")]
    public int AutoCompleteSinglelineMaxTokens { get; set; }
    [JsonProperty(PropertyName = "autoCompleteMultilineMaxTokens")]
    public int AutoCompleteMultilineMaxTokens { get; set; }
    [JsonProperty(PropertyName = "editTopK")]
    public int EditTopK { get; set; }
    [JsonProperty(PropertyName = "editTopP")]
    public int EditTopP { get; set; }
    [JsonProperty(PropertyName = "editTemperature")]
    public int EditTemperature { get; set; }
    [JsonProperty(PropertyName = "editMaxTokens")]
    public int EditMaxTokens { get; set; }
  }
}
