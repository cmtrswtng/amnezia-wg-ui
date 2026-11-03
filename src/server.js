'use strict';

require('./services/Server');

const WireGuard = require('./services/WireGuard');

WireGuard.getConfig()
  .then(() => WireGuard.startTrafficSampling())
  .catch((err) => {
  // eslint-disable-next-line no-console
    console.error(err);

    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });

// Handle terminate signal
const shutdown = async () => {
  // eslint-disable-next-line no-console
  console.log('Shutting down.');
  await WireGuard.Shutdown();
  // eslint-disable-next-line no-process-exit
  process.exit(0);
};
process.once('SIGTERM', shutdown);

// Handle interrupt signal
process.once('SIGINT', shutdown);
