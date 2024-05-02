const remote = require('@electron/remote');

export default function getDocsEndpoint() {
  const localDocs = remote.getGlobal('useLocalDocs');
  return localDocs ? 'http://localhost:3000' : 'https://the-low-code-foundation.github.io/code-crusher-docs';
}
