import * as Sentry from '@sentry/browser'
import { BrowserTracing } from '@sentry/tracing'

Sentry.init({
  dsn: 'https://b8fa071a70cd455f9e63c105e9be7050@mt.mooncell.wiki/2',
  integrations: [
    new BrowserTracing(),
    new Sentry.Integrations.Breadcrumbs({ console: false }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.0001,
})
