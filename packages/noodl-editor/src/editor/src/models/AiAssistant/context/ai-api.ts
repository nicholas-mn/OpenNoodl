import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';
import { OpenAiStore } from '@noodl-store/AiAssistantStore';

import { AiCopilotChatProviders, AiCopilotChatStreamArgs } from '@noodl-models/AiAssistant/interfaces';

function toChatProvider(provider: AiCopilotChatProviders | undefined) {
  return {
    model: provider?.model || 'gpt-3.5-turbo',
    temperature: provider?.temperature,
    max_tokens: provider?.max_tokens
  };
}

async function directChatOpenAi({ messages, provider, abortController, onEnd, onStream }: AiCopilotChatStreamArgs) {
  const OPENAI_API_KEY = OpenAiStore.getApiKey();
  const controller = abortController || new AbortController();
  let endpoint = `https://api.openai.com/v1/chat/completions`;

  if (OpenAiStore.getVersion() === 'enterprise') {
    endpoint = OpenAiStore.getEndpoint();
  }

  let fullText = '';
  let completionTokenCount = 0;

  let tries = 2;
  await fetchEventSource(endpoint, {
    method: 'POST',
    openWhenHidden: true,
    headers: {
      Authorization: 'Bearer ' + OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    signal: controller.signal,
    body: JSON.stringify({
      ...toChatProvider(provider),
      messages,
      stream: true
    }),
    async onopen(response) {
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('text/event-stream')) {
        return; // everything's good
      } else {
        // If status is not OK or content type is unexpected, throw the response body
        const errorMessage = await response.text(); // Await the response body text
        const errorDetails = `HTTP ${response.status} - ${response.statusText}: ${errorMessage}`;
        throw errorDetails; // Throw the raw error string
      }
    },
    onmessage(ev) {
      if (ev.data === '[DONE]') {
        controller.abort();
        return;
      }

      try {
        const json = JSON.parse(ev.data);
        const delta = json.choices[0].delta.content;
        if (delta) {
          completionTokenCount++;
          fullText += delta;
          console.debug('[stream]', fullText);
          onStream && onStream(fullText, delta);
        }
      } catch (error) {
        console.error(error);
      }
    },
    onclose() {
      onEnd && onEnd();
    },
    onerror(err) {
      if (tries <= 0) {
        throw err; // Just rethrow the error directly
      }
      tries--;
    }
  });

  return {
    fullText,
    completionTokenCount
  };
}

export namespace Ai {
  export async function chatStream(args: AiCopilotChatStreamArgs): Promise<string> {
    let fullText = '';

    const version = OpenAiStore.getVersion();
    if (['full-beta', 'enterprise'].includes(version)) {
      const result = await directChatOpenAi(args);
      fullText = result.fullText;
    } else {
      throw 'Invalid AI version.';
    }

    return fullText;
  }
}
