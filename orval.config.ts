import { defineConfig } from 'orval';

const openApiUrl = process.env.ORVAL_OPENAPI_URL ?? 'http://localhost:8080/v3/api-docs';

export default defineConfig({
  stockApi: {
    input: openApiUrl,
    output: {
      mode: 'tags-split',
      target: 'src/services/api/generated',
      schemas: 'src/services/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      override: {
        mutator: {
          path: './src/services/api/http-client.ts',
          name: 'apiFetch',
        },
      },
    },
  },
});

