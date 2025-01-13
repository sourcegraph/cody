/*
<<<<
func doChatCompletionsAPIAutocomplete(
	ctx context.Context,
	client CompletionsClient,
	request types.CompletionRequest,
	logger log.Logger,
) (*types.CompletionResponse, error) {
	response, err := client.GetChatCompletions(ctx, getChatOptions(request), nil)
	if err != nil {
		return nil, toStatusCodeError(err)
	}
====
func doChatCompletionsAPIAutocomplete(
	ctx context.Context,
	client CompletionsClient,
	request types.CompletionRequest,
	logger log.Logger,
) (*types.CompletionResponse, error) {
	options, err := getChatOptions(request)
	if err != nil {
		return nil, err
	}
	response, err := client.GetChatCompletions(ctx, options, nil)
	if err != nil {
		return nil, toStatusCodeError(err)
	}
>>>>
*/


func doChatCompletionsAPIAutocomplete(
	ctx context.Context,
	client CompletionsClient,
	request types.CompletionRequest,
	logger log.Logger,
) (*types.CompletionResponse, error) {
	response, err := client.GetChatCompletions(ctx, getChatOptions(request), nil)
	if err != nil {
		return nil, toStatusCodeError(err)
	}