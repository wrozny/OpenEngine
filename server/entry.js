import { runServer } from './cli.js';
runServer().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
