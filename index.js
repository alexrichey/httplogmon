var LogMonitor = require('./src/log_mon'),
    logMakerServer = require('./src/log_maker_server.js'),
    _ = require('lodash'),
    clear = require('clear');


const LOG_FILE_PATH = process.env.LOG_FILE_PATH || '/tmp/access.log';
const REFRESH_LOOP_MS = parseInt(process.env.REFRESH_LOOP_MS) || 10 * 1000;
const LOG_CACHE_RETENTION_TIME_SECONDS = parseInt(process.env.LOG_CACHE_RETENTION_TIME_SECONDS) || 120;
const DISREGARD_LOG_TIMESTAMP = process.env.DISREGARD_LOG_TIMESTAMP || true;

var testServerRunning = false;
var serverPort = parseInt(process.env.LOG_MAKER_SERVER_PORT) || 3000;

var accessLogMonitor = new LogMonitor({
  logFilePath: LOG_FILE_PATH,
  logCacheRetentionTimeSeconds: LOG_CACHE_RETENTION_TIME_SECONDS,
  ignoreOldTimestampLogs: DISREGARD_LOG_TIMESTAMP
});

var startTime = new Date();
function redraw(logMonitor) {
  console.log(`HTTP MON!`);
  console.log(`uptime: ${((new Date()) - startTime)/1000}, total logs cached: ${accessLogMonitor.logs.length}, total log errors: ${logMonitor.errors.length}`);
  console.log(`Monitoring file at ${LOG_FILE_PATH}, refreshing every ${REFRESH_LOOP_MS / 1000} seconds, retaining cached logs for ${logMonitor.CACHED_LOG_RETENTION_SECONDS} seconds`);
  if (testServerRunning) {
    console.log(`Running test server. Generate fake messages by POST'ing to localhost:${serverPort}/count=[n]\n`);
  }

  // print short term stats
  console.log(`\n\n-------------- Recent Traffic (${REFRESH_LOOP_MS / 1000} seconds) Stats --------------`);
  console.log(`Total Hits: ${accessLogMonitor.shortTermHitCount}`);
  console.log(`Top 5 Sections`);
  console.table(logMonitor.getTopUriSections(5));
  console.log(`Top 5 Remote Users by Hits`);
  console.table(logMonitor.getTopUsersHits(5));

  // print long term stats
  console.log(`\n\n-------------- Long Term (${logMonitor.CACHED_LOG_RETENTION_SECONDS} seconds) Traffic Stats --------------`);
  console.log(`Total Hits: ${accessLogMonitor.logs.length}`);
  logMonitor.printTrafficAlerts();
  console.log('\n\nOverall Last 10 Requests');
  console.table(logMonitor.makeLastNRequestsList(10));
}


function refreshDisplayLoop() {
  clear(); // clear the console screen
  redraw(accessLogMonitor);
  accessLogMonitor.clearCachedStats();
  setTimeout(() => {refreshDisplayLoop();}, REFRESH_LOOP_MS);
}

accessLogMonitor.start();
refreshDisplayLoop();

if (process.env.RUN_LOG_MAKER_SERVER || true) {
  logMakerServer(LOG_FILE_PATH, serverPort);
  testServerRunning = true;
}
