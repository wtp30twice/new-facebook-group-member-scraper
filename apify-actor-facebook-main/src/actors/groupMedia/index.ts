import { log, LEVELS } from '@apify/log';
log.setLevel(LEVELS.INFO);
import { run } from './actor';

const main = async () => {
  await run();
};

main();
