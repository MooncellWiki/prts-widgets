import * as Sentry from '@sentry/browser'
import { BrowserTracing } from '@sentry/tracing'

Sentry.init({
  dsn: location.host.includes('prts') ? 'https://b8fa071a70cd455f9e63c105e9be7050@mt.mooncell.wiki/2' : 'https://dae44b0169d14d9cab6a30a81c292fd4@mt.mooncell.wiki/8',
  integrations: [
    new BrowserTracing(),
    new Sentry.Integrations.Breadcrumbs({ console: false }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 0.0001,
  sampleRate: 0.01,
})

window.Sentry = {
  showReportDialog: Sentry.showReportDialog,
  captureException: Sentry.captureException,
}
